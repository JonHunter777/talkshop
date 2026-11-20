import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, FilterQuery, Model } from 'mongoose';
import type { CartItemRecord } from '../cart/cart.types';
import { CartService } from '../cart/cart.service';
import { CURRENCY, MAX_ORDER_NUMBER_ATTEMPTS, type OrderStatus } from '../common/constants/shop';
import { buildPaginated, getSkip, Paginated } from '../common/dto/paginated-response';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { isDuplicateKeyError } from '../common/utils/mongo-errors';
import { isObjectIdString } from '../common/utils/object-id';
import { ProductsService } from '../products/products.service';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ORDER_NUMBER_GENERATOR, type OrderNumberGenerator } from './order-number';
import { CANCELLABLE_STATUSES, type PatchableStatus, statusesThatCanMoveTo } from './order-status';
import type {
  AdminOrderView,
  OrderItemView,
  OrderRecord,
  OrderView,
  StockProblem,
} from './orders.types';
import { Order, OrderItem } from './schemas/order.schema';

// Maps a lean record to the shape that is returned by the API
export function toOrderView(order: OrderRecord): OrderView {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    items: order.items.map((item): OrderItemView => ({
      productId: item.productId.toString(),
      name: item.name,
      slug: item.slug,
      priceCents: item.priceCents,
      quantity: item.quantity,
    })),
    totalCents: order.totalCents,
    currency: order.currency,
    status: order.status,
    shipping: {
      fullName: order.shipping.fullName,
      phone: order.shipping.phone,
      city: order.shipping.city,
      address: order.shipping.address,
    },
    ...(order.note !== undefined && { note: order.note }),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export function toAdminOrderView(order: OrderRecord): AdminOrderView {
  return { ...toOrderView(order), userId: order.userId.toString() };
}

// Newest first. `_id` is only a tie-breaker for stable pagination; the indexes in order.schema.ts
// contain it, otherwise the database would have to sort in memory.
export const NEWEST_FIRST = { createdAt: -1, _id: -1 } as const;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectConnection() private readonly connection: Connection,
    private readonly cartService: CartService,
    private readonly productsService: ProductsService,
    @Inject(ORDER_NUMBER_GENERATOR) private readonly generateOrderNumber: OrderNumberGenerator,
  ) {}

  // Turns the cart of the user into an order.
  //
  // The order number comes from a random generator and is protected by a unique index. A
  // duplicate aborts the transaction, so the WHOLE checkout is repeated with a new number
  // (at most MAX_ORDER_NUMBER_ATTEMPTS times). After that it is a plain server error (500):
  // the client gets a generic message, the cause goes to the server log.
  async checkout(userId: string, dto: CreateOrderDto): Promise<OrderView> {
    for (let attempt = 1; attempt <= MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
      const orderNumber = this.generateOrderNumber();
      try {
        return await this.placeOrder(userId, dto, orderNumber);
      } catch (error) {
        // `orderNumber` is the only unique index of the orders collection, so any E11000
        // while placing an order means this number is already taken.
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        this.logger.warn(
          `Order number ${orderNumber} is taken (attempt ${attempt} of ${MAX_ORDER_NUMBER_ATTEMPTS})`,
        );
      }
    }
    // Not an HttpException on purpose: the global filter answers 500 and logs this message
    throw new Error(
      `Could not generate a unique order number in ${MAX_ORDER_NUMBER_ATTEMPTS} attempts`,
    );
  }

  async findMine(userId: string, query: PaginationQueryDto): Promise<Paginated<OrderView>> {
    const { page, limit } = query;
    const filter = { userId };
    const [records, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort(NEWEST_FIRST)
        .skip(getSkip(page, limit))
        .limit(limit)
        .lean<OrderRecord[]>()
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);
    return buildPaginated(records.map(toOrderView), total, { page, limit });
  }

  // Ownership is part of the query: someone else's order is indistinguishable from a missing
  // one (404 in both cases), so ids of other users' orders cannot be probed.
  async findMineById(userId: string, orderId: string): Promise<OrderView> {
    const record = isObjectIdString(orderId)
      ? await this.orderModel.findOne({ _id: orderId, userId }).lean<OrderRecord>().exec()
      : null;
    if (!record) {
      throw new NotFoundException('Order not found');
    }
    return toOrderView(record);
  }

  // --- Admin methods. The controller routes are protected by @Roles('admin'), and RolesGuard
  // --- confirms the role in the database; this service never looks at roles itself.

  // The orders of ALL users, optionally only one status, newest first.
  // Which index serves which query: see the indexes in order.schema.ts (checked with explain
  // in the e2e tests: no in-memory SORT either with or without the status filter).
  async findAll(query: AdminOrderQueryDto): Promise<Paginated<AdminOrderView>> {
    const { page, limit, status } = query;
    const filter: FilterQuery<Order> = status ? { status } : {};
    const [records, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort(NEWEST_FIRST)
        .skip(getSkip(page, limit))
        .limit(limit)
        .lean<OrderRecord[]>()
        .exec(),
      // countDocuments without a filter counts the whole collection: fine for this size
      this.orderModel.countDocuments(filter).exec(),
    ]);
    return buildPaginated(records.map(toAdminOrderView), total, { page, limit });
  }

  // Any order by id (no ownership condition), with its owner
  async findAnyById(orderId: string): Promise<AdminOrderView> {
    const record = isObjectIdString(orderId)
      ? await this.orderModel.findById(orderId).lean<OrderRecord>().exec()
      : null;
    if (!record) {
      throw new NotFoundException('Order not found');
    }
    return toAdminOrderView(record);
  }

  // Moves an order to the next status (PATCH). `cancelled` is not accepted here (see cancel()).
  //
  // Checking the current status and changing it is ONE atomic update: the condition
  // `status in <statuses that may move to the target>` is part of the query. Two admins doing
  // the same transition at once: one update matches, the other matches nothing -> 409.
  async updateStatus(orderId: string, to: PatchableStatus): Promise<AdminOrderView> {
    const updated = await this.orderModel
      .findOneAndUpdate(
        { _id: orderId, status: { $in: statusesThatCanMoveTo(to) } },
        { $set: { status: to } },
        { new: true },
      )
      .lean<OrderRecord>()
      .exec();
    if (updated) {
      return toAdminOrderView(updated);
    }
    // Nothing matched: either there is no such order (404) or its status does not allow it (409).
    // This second read only chooses the error; the change itself was decided by the update above.
    const current = await this.orderModel
      .findById(orderId)
      .select('status')
      .lean<{ status: OrderStatus }>()
      .exec();
    if (!current) {
      throw new NotFoundException('Order not found');
    }
    throw new ConflictException(`The status cannot be changed from ${current.status} to ${to}`);
  }

  // Cancels an order and gives the stock back, in ONE transaction (all calls take `session`):
  // 1) the status changes to `cancelled` only if it is `pending` or `processing` (the condition
  //    is in the query itself), 2) every line of the snapshot returns its quantity to the product.
  // If any step fails, everything rolls back: the status stays as it was, no stock changes,
  // and the cancel can simply be repeated.
  //
  // Two cancels at once: both try to change the same order document, the second one loses the
  // write conflict, is retried, sees `cancelled` and answers 409. The stock returns exactly once.
  //
  // A line whose product was deleted is skipped (there is nothing to return the stock to, and
  // the cancel must not be blocked forever). The skipped lines are logged on the server.
  async cancel(orderId: string): Promise<AdminOrderView> {
    // The callback may run again after a write conflict: it returns data instead of logging,
    // and the logging happens once, after the transaction has been committed.
    const { order, skipped } = await this.connection.transaction(async (session) => {
      const cancelled = await this.orderModel
        .findOneAndUpdate(
          { _id: orderId, status: { $in: CANCELLABLE_STATUSES } },
          { $set: { status: 'cancelled' } },
          { new: true, session },
        )
        .lean<OrderRecord>()
        .exec();
      if (!cancelled) {
        const current = await this.orderModel
          .findById(orderId)
          .session(session)
          .select('status')
          .lean<{ status: OrderStatus }>()
          .exec();
        if (!current) {
          throw new NotFoundException('Order not found');
        }
        throw new ConflictException(`An order in the status ${current.status} cannot be cancelled`);
      }

      const skippedLines: OrderItem[] = [];
      // One by one: operations of one transaction run in sequence
      for (const item of cancelled.items) {
        const restored = await this.productsService.incrementStock(
          item.productId.toString(),
          item.quantity,
          session,
        );
        if (!restored) {
          skippedLines.push(item);
        }
      }
      return { order: cancelled, skipped: skippedLines };
    });

    for (const item of skipped) {
      this.logger.warn(
        `Order ${order.orderNumber} cancelled: product ${item.productId.toString()} no longer ` +
          `exists, stock of ${item.quantity} not returned`,
      );
    }
    return toAdminOrderView(order);
  }

  // One transaction. EVERY database call inside it takes `session`: a call without it would
  // run outside the transaction and would not be rolled back.
  private async placeOrder(
    userId: string,
    dto: CreateOrderDto,
    orderNumber: string,
  ): Promise<OrderView> {
    // The callback may be run again by Mongoose if the transaction hits a write conflict
    // (e.g. two parallel checkouts), so it must not change anything outside the transaction.
    return this.connection.transaction(async (session) => {
      const cartItems = await this.cartService.findItems(userId, session);
      if (cartItems.length === 0) {
        throw new BadRequestException('The cart is empty');
      }

      const { lines, problems } = await this.reserveLines(cartItems, session);

      if (problems.length > 0) {
        // Throwing inside the transaction rolls back the stock changes of the lines that did
        // fit: nothing is changed, the cart stays as it was.
        throw new ConflictException({
          statusCode: 409,
          message: 'Some items in the cart cannot be ordered',
          items: problems,
        });
      }

      // The total is calculated here, from the prices read in this transaction
      const totalCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);

      const [created] = await this.orderModel.create(
        [
          {
            orderNumber,
            userId,
            items: lines,
            totalCents,
            currency: CURRENCY,
            status: 'pending',
            shipping: dto.shipping,
            ...(dto.note !== undefined && { note: dto.note }),
          },
        ],
        { session },
      );
      if (!created) {
        throw new Error('The order was not created');
      }

      await this.cartService.clear(userId, session);

      return toOrderView(created.toObject());
    });
  }

  // Takes the stock for every cart line (one atomic conditional `$inc` per line) and builds the
  // snapshot lines of the order. It does NOT stop at the first problem: all problem lines are
  // collected, so the client sees the full list at once. The caller must throw if there are
  // problems: that rolls back the lines that did fit. Must run inside the checkout transaction:
  // every call takes `session`.
  private async reserveLines(
    cartItems: CartItemRecord[],
    session: ClientSession,
  ): Promise<{ lines: OrderItem[]; problems: StockProblem[] }> {
    const products = await this.productsService.findManyByIds(
      cartItems.map((item) => item.productId.toString()),
      session,
    );
    const productsById = new Map(products.map((product) => [product._id.toString(), product]));

    const problems: StockProblem[] = [];
    const lines: OrderItem[] = [];
    for (const item of cartItems) {
      const productId = item.productId.toString();
      const product = productsById.get(productId);
      if (!product) {
        problems.push({ productId, reason: 'not_found', requested: item.quantity, available: 0 });
        continue;
      }
      // Atomic: the stock check and the decrement are one operation in the database
      const reserved = await this.productsService.decrementStock(productId, item.quantity, session);
      if (!reserved) {
        problems.push({
          productId,
          reason: 'insufficient_stock',
          requested: item.quantity,
          available: product.stock,
        });
        continue;
      }
      lines.push({
        productId: item.productId,
        name: product.name,
        slug: product.slug,
        priceCents: product.priceCents,
        quantity: item.quantity,
      });
    }
    return { lines, problems };
  }
}
