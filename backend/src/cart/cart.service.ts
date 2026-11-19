import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { MAX_CART_ITEMS, MAX_ITEM_QUANTITY } from '../common/constants/shop';
import { isDuplicateKeyError } from '../common/utils/mongo-errors';
import { ProductsService } from '../products/products.service';
import type { ProductRecord } from '../products/products.types';
import { buildCartView } from './cart.view';
import type { CartItemRecord, CartView } from './cart.types';
import { Cart } from './schemas/cart.schema';

// After a lost race (E11000 on cart creation, or a failed $push because a parallel request
// already added the line) the operation is retried, but at most this many attempts in total.
const MAX_ATTEMPTS = 2;

const BUSY_MESSAGE = 'The cart is being changed by another request, please try again';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<Cart>,
    private readonly productsService: ProductsService,
  ) {}

  // Does NOT create a document: a user without a cart gets an empty cart, nothing is written.
  async getCart(userId: string): Promise<CartView> {
    const cart = await this.cartModel
      .findOne({ userId })
      .lean<{ items: CartItemRecord[] }>()
      .exec();
    const items = cart?.items ?? [];
    const products = await this.productsService.findManyByIds(
      items.map((item) => item.productId.toString()),
    );
    return buildCartView(items, products);
  }

  // Raw cart lines for checkout (orders). Pass the checkout session: the read must be part of
  // the same transaction as the stock updates and the cart cleanup.
  async findItems(userId: string, session?: ClientSession): Promise<CartItemRecord[]> {
    const cart = await this.cartModel
      .findOne({ userId })
      .session(session ?? null)
      .lean<{ items: CartItemRecord[] }>()
      .exec();
    return cart?.items ?? [];
  }

  // Adds `quantity` to the line of the product (or creates the line).
  //
  // Every change is ONE conditional update in the database (no read-modify-write), so parallel
  // requests for the same product end up in one line with the summed quantity.
  //
  // About stock: it is read from the product BEFORE the update, and the cart does not reserve
  // it. So this check is a best-effort guard against obviously wrong requests; the final and
  // only reliable stock check happens at checkout (orders).
  async addItem(userId: string, productId: string, quantity: number): Promise<CartView> {
    const product = await this.requireProduct(productId);
    const limit = Math.min(product.stock, MAX_ITEM_QUANTITY);
    if (quantity > limit) {
      throw new ConflictException(`Only ${limit} item(s) can be added for this product`);
    }

    await this.ensureCart(userId);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // 1) The line exists: increase it, if the result stays within the limit
      const increased = await this.cartModel
        .updateOne(
          {
            userId,
            items: { $elemMatch: { productId, quantity: { $lte: limit - quantity } } },
          },
          { $inc: { 'items.$.quantity': quantity } },
        )
        .exec();
      if (increased.modifiedCount === 1) {
        return this.getCart(userId);
      }

      // 2) No such line: add it, if there is no such line yet and the cart is not full
      const pushed = await this.cartModel
        .updateOne(
          {
            userId,
            'items.productId': { $ne: productId },
            [`items.${MAX_CART_ITEMS - 1}`]: { $exists: false },
          },
          { $push: { items: { productId, quantity } } },
        )
        .exec();
      if (pushed.modifiedCount === 1) {
        return this.getCart(userId);
      }

      // 3) Neither worked: find out why
      const cart = await this.cartModel
        .findOne({ userId })
        .lean<{ items: CartItemRecord[] }>()
        .exec();
      const line = cart?.items.find((item) => item.productId.toString() === productId);
      if (line) {
        if (line.quantity + quantity > limit) {
          throw new ConflictException(
            `Not enough stock: ${line.quantity} already in the cart, at most ${limit} allowed`,
          );
        }
        // The line appeared after step 1 (parallel request): try again from step 1
        continue;
      }
      if (cart && cart.items.length >= MAX_CART_ITEMS) {
        throw new ConflictException(`The cart cannot have more than ${MAX_CART_ITEMS} lines`);
      }
    }
    throw new ConflictException(BUSY_MESSAGE);
  }

  // Sets the NEW quantity of an existing line. Same note about stock as in addItem.
  async setQuantity(userId: string, productId: string, quantity: number): Promise<CartView> {
    const product = await this.requireProduct(productId);
    const limit = Math.min(product.stock, MAX_ITEM_QUANTITY);
    if (quantity > limit) {
      throw new ConflictException(`Only ${limit} item(s) are available for this product`);
    }

    const result = await this.cartModel
      .updateOne(
        { userId, 'items.productId': productId },
        { $set: { 'items.$.quantity': quantity } },
      )
      .exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException('Item not found in the cart');
    }
    return this.getCart(userId);
  }

  // Works for deleted products too: this is how an unavailable line is removed.
  async removeItem(userId: string, productId: string): Promise<CartView> {
    const result = await this.cartModel
      .updateOne({ userId, 'items.productId': productId }, { $pull: { items: { productId } } })
      .exec();
    if (result.modifiedCount === 0) {
      throw new NotFoundException('Item not found in the cart');
    }
    return this.getCart(userId);
  }

  // Empties the cart (the document stays). Idempotent. Orders will call this with the
  // checkout session, so it takes part in the transaction.
  async clear(userId: string, session?: ClientSession): Promise<void> {
    await this.cartModel.updateOne({ userId }, { $set: { items: [] } }, { session }).exec();
  }

  private async requireProduct(productId: string): Promise<ProductRecord> {
    const [product] = await this.productsService.findManyByIds([productId]);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  // Creates an empty cart if the user has none.
  // Most calls only read: a user who already has a cart causes no write here.
  // The upsert stays for the first creation, because two parallel first adds can both see
  // "no cart". The unique index on userId makes that safe: the loser gets E11000, which only
  // means "the cart exists now", so the upsert is repeated (at most MAX_ATTEMPTS in total).
  private async ensureCart(userId: string): Promise<void> {
    const exists = await this.cartModel.exists({ userId });
    if (exists) {
      return;
    }
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.cartModel
          .updateOne({ userId }, { $setOnInsert: { items: [] } }, { upsert: true })
          .exec();
        return;
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }
    throw new ConflictException(BUSY_MESSAGE);
  }
}
