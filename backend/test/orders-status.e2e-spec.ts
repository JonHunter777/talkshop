import { INestApplication, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import type { OrderStatus } from '../src/common/constants/shop';
import { generateOrderNumber } from '../src/orders/order-number';
import { Order } from '../src/orders/schemas/order.schema';
import { ProductsService } from '../src/products/products.service';
import { Product } from '../src/products/schemas/product.schema';
import { User } from '../src/users/schemas/user.schema';
import { createAdmin, type TestAdmin } from './helpers/create-admin';
import { createTestApp } from './helpers/create-test-app';
import { dropTestDb } from './helpers/test-db';

interface OrderBody {
  id: string;
  status: string;
  userId?: string;
}

const shipping = {
  fullName: 'Ivan Petrenko',
  phone: '+380 (50) 123-45-67',
  city: 'Kyiv',
  address: 'Khreshchatyk St, 1',
};

describe('Order status and cancel (e2e, in-memory MongoDB)', () => {
  let app: INestApplication<App>;
  let orderModel: Model<Order>;
  let productModel: Model<Product>;
  let userModel: Model<User>;
  let productsService: ProductsService;
  let jwt: JwtService;
  let admin: TestAdmin;
  let errorLog: jest.SpyInstance;
  let warnLog: jest.SpyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    orderModel = app.get<Model<Order>>(getModelToken(Order.name));
    productModel = app.get<Model<Product>>(getModelToken(Product.name));
    userModel = app.get<Model<User>>(getModelToken(User.name));
    productsService = app.get(ProductsService);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  beforeEach(async () => {
    await Promise.all([orderModel.deleteMany({}), productModel.deleteMany({})]);
    admin = await createAdmin(app);
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const customerToken = (): string =>
    jwt.sign({ sub: new Types.ObjectId().toString(), role: 'customer' });

  let counter = 0;
  const seedProduct = async (overrides: Partial<Product> = {}): Promise<string> => {
    counter += 1;
    const product = await productModel.create({
      name: `Product ${counter}`,
      slug: `product-${counter}`,
      description: 'Test product.',
      category: 'kitchen',
      priceCents: 1000,
      stock: 10,
      ...overrides,
    });
    return product.id as string;
  };

  // A real checkout: the stock really goes down, so cancel has something to give back
  const placeOrder = async (
    lines: { productId: string; quantity: number }[],
    token: string = customerToken(),
  ): Promise<string> => {
    for (const line of lines) {
      await api().post('/api/cart/items').set(auth(token)).send(line).expect(201);
    }
    const res = await api().post('/api/orders').set(auth(token)).send({ shipping }).expect(201);
    return (res.body as OrderBody).id;
  };

  // An order inserted directly with a chosen status (no stock involved)
  const seedOrderWithStatus = async (status: OrderStatus): Promise<string> => {
    const order = await orderModel.create({
      orderNumber: generateOrderNumber(),
      userId: new Types.ObjectId(),
      items: [
        {
          productId: new Types.ObjectId(),
          name: 'Cup',
          slug: 'cup',
          priceCents: 700,
          quantity: 1,
        },
      ],
      totalCents: 700,
      shipping,
      status,
    });
    return order.id as string;
  };

  const patchStatus = (id: string, body: object, token: string = admin.token) =>
    api().patch(`/api/orders/${id}/status`).set(auth(token)).send(body);
  const cancel = (id: string, token: string = admin.token) =>
    api().post(`/api/orders/${id}/cancel`).set(auth(token));

  const stockOf = async (productId: string): Promise<number | undefined> =>
    (await productModel.findById(productId).lean())?.stock;
  const statusOf = async (orderId: string): Promise<string | undefined> =>
    (await orderModel.findById(orderId).lean())?.status;

  describe('access (both routes)', () => {
    const id = new Types.ObjectId().toString();
    const routes: [string, (token?: string) => request.Test][] = [
      [
        'PATCH /:id/status',
        (t) =>
          t
            ? patchStatus(id, { status: 'processing' }, t)
            : api().patch(`/api/orders/${id}/status`).send({ status: 'processing' }),
      ],
      ['POST /:id/cancel', (t) => (t ? cancel(id, t) : api().post(`/api/orders/${id}/cancel`))],
    ];

    it.each(routes)('%s without a token returns 401', async (_name, call) => {
      await call().expect(401);
    });

    it.each(routes)('%s returns 403 for a customer', async (_name, call) => {
      await call(customerToken()).expect(403);
    });

    it.each(routes)(
      '%s returns 403 for a token admin demoted in the database',
      async (_n, call) => {
        await userModel.updateOne({ _id: admin.id }, { role: 'customer' });

        await call(admin.token).expect(403);
      },
    );

    it.each(routes)('%s returns 401 for a token admin whose user was deleted', async (_n, call) => {
      await userModel.deleteOne({ _id: admin.id });

      await call(admin.token).expect(401);
    });

    it('does not change an order for a customer, even the owner', async () => {
      const productId = await seedProduct();
      const owner = customerToken();
      const orderId = await placeOrder([{ productId, quantity: 2 }], owner);

      await patchStatus(orderId, { status: 'processing' }, owner).expect(403);
      await cancel(orderId, owner).expect(403);

      expect(await statusOf(orderId)).toBe('pending');
      expect(await stockOf(productId)).toBe(8);
    });
  });

  describe('PATCH /api/orders/:id/status', () => {
    it('walks pending -> processing -> shipped -> delivered, with the owner in the response', async () => {
      const productId = await seedProduct({ stock: 10 });
      const orderId = await placeOrder([{ productId, quantity: 2 }]);

      for (const status of ['processing', 'shipped', 'delivered']) {
        const res = await patchStatus(orderId, { status }).expect(200);

        expect(res.body).toMatchObject({ id: orderId, status });
        expect(res.body).toHaveProperty('userId');
      }

      // Status changes never touch the stock
      expect(await stockOf(productId)).toBe(8);
    });

    describe('rejects every other transition with 409 and changes nothing', () => {
      const forbidden: [OrderStatus, OrderStatus][] = [
        ['pending', 'shipped'],
        ['pending', 'delivered'],
        ['processing', 'processing'],
        ['processing', 'delivered'],
        ['shipped', 'processing'],
        ['shipped', 'shipped'],
        ['delivered', 'processing'],
        ['delivered', 'shipped'],
        ['delivered', 'delivered'],
        ['cancelled', 'processing'],
        ['cancelled', 'shipped'],
        ['cancelled', 'delivered'],
      ];

      it.each(forbidden)('%s -> %s', async (from, to) => {
        const orderId = await seedOrderWithStatus(from);

        await patchStatus(orderId, { status: to }).expect(409);

        expect(await statusOf(orderId)).toBe(from);
      });
    });

    // Cancelling has its own route: the PATCH route must not be a second way to cancel,
    // because it would skip returning the stock
    it('returns 400 for cancelled, and the status and the stock stay as they were', async () => {
      const productId = await seedProduct({ stock: 10 });
      const orderId = await placeOrder([{ productId, quantity: 3 }]);
      expect(await stockOf(productId)).toBe(7);

      await patchStatus(orderId, { status: 'cancelled' }).expect(400);

      expect(await statusOf(orderId)).toBe('pending');
      expect(await stockOf(productId)).toBe(7);
    });

    it.each([
      ['pending', { status: 'pending' }],
      ['an unknown status', { status: 'refunded' }],
      ['null', { status: null }],
      ['an empty body', {}],
      ['an extra field', { status: 'processing', userId: '665f1c2e8a1b2c3d4e5f6a7b' }],
    ])('returns 400 for %s', async (_name, body) => {
      const orderId = await seedOrderWithStatus('pending');

      await patchStatus(orderId, body).expect(400);

      expect(await statusOf(orderId)).toBe('pending');
    });

    it('returns 400 for a malformed id and 404 for an unknown order', async () => {
      await patchStatus('123', { status: 'processing' }).expect(400);
      await patchStatus(new Types.ObjectId().toString(), { status: 'processing' }).expect(404);
    });

    it('lets only one of two parallel identical transitions through (409 for the other)', async () => {
      const orderId = await seedOrderWithStatus('pending');

      const results = await Promise.all([
        patchStatus(orderId, { status: 'processing' }),
        patchStatus(orderId, { status: 'processing' }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await statusOf(orderId)).toBe('processing');
    });
  });

  describe('POST /api/orders/:id/cancel', () => {
    it('cancels a pending order and gives every item back to the stock', async () => {
      const a = await seedProduct({ stock: 10 });
      const b = await seedProduct({ stock: 5 });
      const orderId = await placeOrder([
        { productId: a, quantity: 3 },
        { productId: b, quantity: 2 },
      ]);
      expect([await stockOf(a), await stockOf(b)]).toEqual([7, 3]);

      const res = await cancel(orderId).expect(200);

      expect(res.body).toMatchObject({ id: orderId, status: 'cancelled' });
      expect(res.body).toHaveProperty('userId');
      expect([await stockOf(a), await stockOf(b)]).toEqual([10, 5]);
    });

    it('cancels a processing order too', async () => {
      const productId = await seedProduct({ stock: 10 });
      const orderId = await placeOrder([{ productId, quantity: 4 }]);
      await patchStatus(orderId, { status: 'processing' }).expect(200);

      await cancel(orderId).expect(200);

      expect(await statusOf(orderId)).toBe('cancelled');
      expect(await stockOf(productId)).toBe(10);
    });

    it.each(['shipped', 'delivered'] as const)(
      'returns 409 for a %s order and returns no stock',
      async (status) => {
        const productId = await seedProduct({ stock: 10 });
        const orderId = await placeOrder([{ productId, quantity: 2 }]);
        await orderModel.updateOne({ _id: orderId }, { status });

        await cancel(orderId).expect(409);

        expect(await statusOf(orderId)).toBe(status);
        expect(await stockOf(productId)).toBe(8);
      },
    );

    it('returns 409 for a repeated cancel and the stock is returned only once', async () => {
      const productId = await seedProduct({ stock: 10 });
      const orderId = await placeOrder([{ productId, quantity: 3 }]);

      await cancel(orderId).expect(200);
      expect(await stockOf(productId)).toBe(10);
      await cancel(orderId).expect(409);
      await cancel(orderId).expect(409);

      expect(await stockOf(productId)).toBe(10);
    });

    it('lets only one of two parallel cancels through, the stock returns exactly once', async () => {
      const productId = await seedProduct({ stock: 10 });
      const orderId = await placeOrder([{ productId, quantity: 3 }]);

      const results = await Promise.all([cancel(orderId), cancel(orderId)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await stockOf(productId)).toBe(10);
      expect(await statusOf(orderId)).toBe('cancelled');
    });

    it('lets only one of six parallel cancels through', async () => {
      const productId = await seedProduct({ stock: 10 });
      const orderId = await placeOrder([{ productId, quantity: 3 }]);

      const results = await Promise.all(Array.from({ length: 6 }, () => cancel(orderId)));

      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(5);
      expect(await stockOf(productId)).toBe(10);
    });

    it('does not touch the stock of other products or other orders', async () => {
      const mine = await seedProduct({ stock: 10 });
      const other = await seedProduct({ stock: 10 });
      const orderId = await placeOrder([{ productId: mine, quantity: 2 }]);
      await placeOrder([{ productId: other, quantity: 5 }]);

      await cancel(orderId).expect(200);

      expect(await stockOf(mine)).toBe(10);
      expect(await stockOf(other)).toBe(5);
    });

    it('skips the line of a deleted product, returns the others and logs the skipped one', async () => {
      const kept = await seedProduct({ stock: 10 });
      const gone = await seedProduct({ stock: 10 });
      const orderId = await placeOrder([
        { productId: kept, quantity: 3 },
        { productId: gone, quantity: 2 },
      ]);
      await productModel.deleteOne({ _id: gone });

      const res = await cancel(orderId).expect(200);

      expect(res.body).toMatchObject({ status: 'cancelled' });
      expect(await stockOf(kept)).toBe(10);
      // The deleted product is not brought back by the cancel
      expect(await productModel.findById(gone)).toBeNull();
      expect(warnLog).toHaveBeenCalledWith(expect.stringContaining(gone));
    });

    // If the return of the stock fails halfway, nothing may stay changed: this also catches
    // a call that forgot `{ session }` (its change would survive the rollback)
    it('rolls everything back when the stock return fails on the SECOND line, then works after a retry', async () => {
      const a = await seedProduct({ stock: 10 });
      const b = await seedProduct({ stock: 10 });
      const orderId = await placeOrder([
        { productId: a, quantity: 3 },
        { productId: b, quantity: 4 },
      ]);
      expect([await stockOf(a), await stockOf(b)]).toEqual([7, 6]);

      const original = productsService.incrementStock.bind(productsService);
      let calls = 0;
      const spy = jest
        .spyOn(productsService, 'incrementStock')
        .mockImplementation(async (...args: Parameters<typeof original>) => {
          calls += 1;
          if (calls === 2) {
            throw new Error('stock return failed');
          }
          return original(...args);
        });

      const failed = await cancel(orderId);

      expect(failed.status).toBe(500);
      expect(failed.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(failed.text).not.toContain('stock return failed');
      expect(errorLog).toHaveBeenCalledWith('stock return failed', expect.any(String));
      // Nothing changed: the status is as before, the FIRST line's stock is not returned either
      expect(await statusOf(orderId)).toBe('pending');
      expect([await stockOf(a), await stockOf(b)]).toEqual([7, 6]);

      // "Fixed": the same cancel now works and returns the stock exactly once
      spy.mockRestore();
      await cancel(orderId).expect(200);
      expect([await stockOf(a), await stockOf(b)]).toEqual([10, 10]);
      expect(await statusOf(orderId)).toBe('cancelled');
    });

    it('returns 400 for a malformed id and 404 for an unknown order', async () => {
      await cancel('123').expect(400);
      await cancel(new Types.ObjectId().toString()).expect(404);
    });

    it('returns 409 and does not change the stock for an order that is already cancelled', async () => {
      const productId = await seedProduct({ stock: 10 });
      const orderId = await placeOrder([{ productId, quantity: 3 }]);
      await orderModel.updateOne({ _id: orderId }, { status: 'cancelled' });
      const stockBefore = await stockOf(productId);
      expect(stockBefore).toBe(7);

      await cancel(orderId).expect(409);

      expect(await stockOf(productId)).toBe(stockBefore);
      expect(await statusOf(orderId)).toBe('cancelled');
    });

    // Cancel and "shipped" race for the same order. Either may win; what must hold is the
    // invariant: one final status, and the stock is consistent with it.
    it('keeps the status and the stock consistent when cancel races with PATCH shipped', async () => {
      const productId = await seedProduct({ stock: 10 });
      const orderId = await placeOrder([{ productId, quantity: 3 }]);
      await patchStatus(orderId, { status: 'processing' }).expect(200);
      const stockBefore = await stockOf(productId);
      expect(stockBefore).toBe(7);

      const [cancelRes, shipRes] = await Promise.all([
        cancel(orderId),
        patchStatus(orderId, { status: 'shipped' }),
      ]);

      const finalStatus = await statusOf(orderId);
      expect(['cancelled', 'shipped']).toContain(finalStatus);
      expect([200, 409]).toContain(cancelRes.status);
      expect([200, 409]).toContain(shipRes.status);
      if (finalStatus === 'cancelled') {
        expect(cancelRes.status).toBe(200);
        expect(shipRes.status).toBe(409);
        expect(await stockOf(productId)).toBe((stockBefore as number) + 3);
      } else {
        expect(shipRes.status).toBe(200);
        expect(cancelRes.status).toBe(409);
        expect(await stockOf(productId)).toBe(stockBefore);
      }
    });
  });
});
