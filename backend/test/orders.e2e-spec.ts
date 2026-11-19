import { INestApplication, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { Cart } from '../src/cart/schemas/cart.schema';
import {
  generateOrderNumber,
  ORDER_NUMBER_GENERATOR,
  ORDER_NUMBER_REGEX,
} from '../src/orders/order-number';
import { Order } from '../src/orders/schemas/order.schema';
import { Product } from '../src/products/schemas/product.schema';
import { createTestApp } from './helpers/create-test-app';
import { dropTestDb } from './helpers/test-db';

interface OrderLineBody {
  productId: string;
  name: string;
  slug: string;
  priceCents: number;
  quantity: number;
}

interface OrderBody {
  id: string;
  orderNumber: string;
  items: OrderLineBody[];
  totalCents: number;
  currency: string;
  status: string;
  shipping: { fullName: string; phone: string; city: string; address: string };
  note?: string;
  userId?: string;
}

interface ListBody {
  items: OrderBody[];
  total: number;
  page: number;
  limit: number;
}

interface ConflictBody {
  statusCode: number;
  message: string;
  items: { productId: string; reason: string; requested: number; available: number }[];
}

const shipping = {
  fullName: 'Ivan Petrenko',
  phone: '+380 (50) 123-45-67',
  city: 'Kyiv',
  address: 'Khreshchatyk St, 1',
};

describe('Orders API (e2e, in-memory MongoDB)', () => {
  let app: INestApplication<App>;
  let orderModel: Model<Order>;
  let cartModel: Model<Cart>;
  let productModel: Model<Product>;
  let jwt: JwtService;
  let userId: string;
  let token: string;
  let errorLog: jest.SpyInstance;

  // The order number generator is replaced by this function, so a test can script the numbers.
  // By default it behaves like the real one.
  const generator = jest.fn<string, []>(() => generateOrderNumber());

  const tokenFor = (sub: string, role: 'customer' | 'admin' = 'customer'): string =>
    jwt.sign({ sub, role });

  beforeAll(async () => {
    app = await createTestApp({
      configure: (builder) => {
        builder.overrideProvider(ORDER_NUMBER_GENERATOR).useValue(generator);
      },
    });
    orderModel = app.get<Model<Order>>(getModelToken(Order.name));
    cartModel = app.get<Model<Cart>>(getModelToken(Cart.name));
    productModel = app.get<Model<Product>>(getModelToken(Product.name));
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  beforeEach(async () => {
    await Promise.all([
      orderModel.deleteMany({}),
      cartModel.deleteMany({}),
      productModel.deleteMany({}),
    ]);
    generator.mockReset();
    generator.mockImplementation(() => generateOrderNumber());
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    userId = new Types.ObjectId().toString();
    token = tokenFor(userId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  const api = () => request(app.getHttpServer());
  const auth = (t: string = token) => ({ Authorization: `Bearer ${t}` });

  const addToCart = async (productId: string, quantity: number, t?: string): Promise<void> => {
    await api().post('/api/cart/items').set(auth(t)).send({ productId, quantity }).expect(201);
  };
  const checkout = (body: object = { shipping }, t?: string) =>
    api().post('/api/orders').set(auth(t)).send(body);

  const stockOf = async (productId: string): Promise<number | undefined> =>
    (await productModel.findById(productId).lean())?.stock;
  const cartLines = async (forUser: string = userId): Promise<number> =>
    (await cartModel.findOne({ userId: forUser }).lean())?.items.length ?? 0;

  it('has the planned indexes', async () => {
    const indexes = await orderModel.collection.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { orderNumber: 1 }, unique: true }),
        expect.objectContaining({ key: { userId: 1, createdAt: -1, _id: -1 } }),
        expect.objectContaining({ key: { status: 1, createdAt: -1, _id: -1 } }),
        expect.objectContaining({ key: { createdAt: -1, _id: -1 } }),
      ]),
    );
  });

  it('serves "my orders, newest first" from the index, without an in-memory SORT', async () => {
    const productId = await seedProduct({ stock: 100 });
    for (let i = 0; i < 3; i++) {
      await addToCart(productId, 1);
      await checkout().expect(201);
    }

    const plan = await orderModel
      .find({ userId })
      .sort({ createdAt: -1, _id: -1 })
      .explain('queryPlanner');

    const text = JSON.stringify(plan);
    expect(text).toContain('IXSCAN');
    expect(text).not.toContain('"stage":"SORT"');
  });

  describe('authentication', () => {
    it.each([
      ['POST', '/api/orders'],
      ['GET', '/api/orders'],
      ['GET', `/api/orders/${new Types.ObjectId().toString()}`],
    ])('%s %s without a token returns 401', async (method, path) => {
      const res = await api()[method.toLowerCase() as 'get'](path);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/orders', () => {
    it('creates an order: snapshot, total, status, number, stock, cart', async () => {
      const a = await seedProduct({
        name: 'Linen towel',
        slug: 'linen-towel',
        priceCents: 2500,
        stock: 10,
      });
      const b = await seedProduct({ name: 'Cup', slug: 'cup', priceCents: 700, stock: 4 });
      await addToCart(a, 2);
      await addToCart(b, 3);

      const res = await checkout({ shipping, note: 'Call before delivery' }).expect(201);
      const order = res.body as OrderBody;

      expect(order.orderNumber).toMatch(ORDER_NUMBER_REGEX);
      expect(order).toMatchObject({
        status: 'pending',
        currency: 'UAH',
        totalCents: 2500 * 2 + 700 * 3,
        shipping,
        note: 'Call before delivery',
      });
      expect(order.items).toEqual([
        { productId: a, name: 'Linen towel', slug: 'linen-towel', priceCents: 2500, quantity: 2 },
        { productId: b, name: 'Cup', slug: 'cup', priceCents: 700, quantity: 3 },
      ]);
      expect(order.userId).toBeUndefined();
      expect(await stockOf(a)).toBe(8);
      expect(await stockOf(b)).toBe(1);
      expect(await cartLines()).toBe(0);
      const saved = await orderModel.findById(order.id).lean();
      expect(saved?.userId.toString()).toBe(userId);
    });

    it('omits the note when none was sent', async () => {
      await addToCart(await seedProduct(), 1);

      const res = await checkout().expect(201);

      expect(res.body).not.toHaveProperty('note');
    });

    it('allows taking exactly the whole stock', async () => {
      const productId = await seedProduct({ stock: 3 });
      await addToCart(productId, 3);

      await checkout().expect(201);

      expect(await stockOf(productId)).toBe(0);
    });

    describe('invalid requests change nothing', () => {
      it.each([
        ['totalCents', 1],
        ['priceCents', 1],
        ['userId', new Types.ObjectId().toString()],
        ['status', 'delivered'],
        ['items', []],
        ['orderNumber', 'TS-261119-AAAAAA'],
      ])('returns 400 for a client-sent %s', async (field, value) => {
        const productId = await seedProduct({ stock: 5 });
        await addToCart(productId, 2);

        await checkout({ shipping, [field]: value }).expect(400);

        expect(await stockOf(productId)).toBe(5);
        expect(await cartLines()).toBe(1);
        expect(await orderModel.countDocuments()).toBe(0);
      });

      it.each([
        ['no shipping', {}],
        ['null note', { shipping, note: null }],
        ['a note of only spaces', { shipping, note: '    ' }],
        ['a phone with 6 digits', { shipping: { ...shipping, phone: '123456' } }],
        ['an address of only spaces', { shipping: { ...shipping, address: '      ' } }],
        ['an unknown shipping field', { shipping: { ...shipping, country: 'UA' } }],
      ])('returns 400 for %s', async (_name, body) => {
        const productId = await seedProduct({ stock: 5 });
        await addToCart(productId, 2);

        await checkout(body).expect(400);

        expect(await stockOf(productId)).toBe(5);
        expect(await cartLines()).toBe(1);
      });
    });

    it('returns 400 for an empty cart', async () => {
      const res = await checkout().expect(400);

      expect(res.body).toMatchObject({ message: 'The cart is empty' });
      expect(await orderModel.countDocuments()).toBe(0);
    });

    it('returns 400 for a cart that was emptied (document exists, no lines)', async () => {
      await addToCart(await seedProduct(), 1);
      await api().delete('/api/cart').set(auth()).expect(204);

      await checkout().expect(400);
    });

    describe('snapshot', () => {
      it('does not change after the product price and name change', async () => {
        const productId = await seedProduct({ name: 'Old name', slug: 'old', priceCents: 1000 });
        await addToCart(productId, 2);
        const placed = (await checkout().expect(201)).body as OrderBody;

        await productModel.updateOne({ _id: productId }, { name: 'New name', priceCents: 9999 });
        const res = await api().get(`/api/orders/${placed.id}`).set(auth()).expect(200);

        const order = res.body as OrderBody;
        expect(order.items[0]).toMatchObject({ name: 'Old name', priceCents: 1000 });
        expect(order.totalCents).toBe(2000);
      });

      it('survives the deletion of the product', async () => {
        const productId = await seedProduct({ name: 'Gone soon', priceCents: 1500 });
        await addToCart(productId, 1);
        const placed = (await checkout().expect(201)).body as OrderBody;

        await productModel.deleteOne({ _id: productId });
        const res = await api().get(`/api/orders/${placed.id}`).set(auth()).expect(200);

        expect((res.body as OrderBody).items[0]).toMatchObject({
          productId,
          name: 'Gone soon',
          priceCents: 1500,
        });
      });
    });

    describe('conflicts (409)', () => {
      it('reports a deleted product as not_found and changes nothing', async () => {
        const kept = await seedProduct({ stock: 5 });
        const gone = await seedProduct({ stock: 5 });
        await addToCart(kept, 2);
        await addToCart(gone, 1);
        await productModel.deleteOne({ _id: gone });

        const res = await checkout().expect(409);

        expect((res.body as ConflictBody).items).toEqual([
          { productId: gone, reason: 'not_found', requested: 1, available: 0 },
        ]);
        expect(await stockOf(kept)).toBe(5);
        expect(await cartLines()).toBe(2);
        expect(await orderModel.countDocuments()).toBe(0);
      });

      it('lists ALL problem lines, rolls back the lines that did fit, keeps the cart', async () => {
        const fits = await seedProduct({ stock: 5 });
        const short1 = await seedProduct({ stock: 5 });
        const short2 = await seedProduct({ stock: 5 });
        const gone = await seedProduct({ stock: 5 });
        await addToCart(fits, 2);
        await addToCart(short1, 4);
        await addToCart(short2, 3);
        await addToCart(gone, 1);
        await productModel.updateOne({ _id: short1 }, { stock: 1 });
        await productModel.updateOne({ _id: short2 }, { stock: 2 });
        await productModel.deleteOne({ _id: gone });

        const res = await checkout().expect(409);

        const body = res.body as ConflictBody;
        expect(body).toMatchObject({ statusCode: 409 });
        expect(body.items).toEqual([
          { productId: short1, reason: 'insufficient_stock', requested: 4, available: 1 },
          { productId: short2, reason: 'insufficient_stock', requested: 3, available: 2 },
          { productId: gone, reason: 'not_found', requested: 1, available: 0 },
        ]);
        expect(await stockOf(short1)).toBe(1);
        expect(await stockOf(short2)).toBe(2);
        expect(await orderModel.countDocuments()).toBe(0);
        expect(await cartLines()).toBe(4);
      });

      // If any call of the transaction forgot `{ session }`, the first line's stock would stay
      // decreased after the rollback.
      it('rolls back the first line when the SECOND line is short (no forgotten session)', async () => {
        const first = await seedProduct({ stock: 10 });
        const second = await seedProduct({ stock: 10 });
        await addToCart(first, 3);
        await addToCart(second, 5);
        await productModel.updateOne({ _id: second }, { stock: 1 });

        await checkout().expect(409);

        expect(await stockOf(first)).toBe(10);
        expect(await stockOf(second)).toBe(1);
        expect(await cartLines()).toBe(2);
      });

      it('succeeds after the problem is fixed (the cart was kept)', async () => {
        const productId = await seedProduct({ stock: 10 });
        await addToCart(productId, 5);
        await productModel.updateOne({ _id: productId }, { stock: 2 });
        await checkout().expect(409);

        await productModel.updateOne({ _id: productId }, { stock: 10 });
        await checkout().expect(201);

        expect(await stockOf(productId)).toBe(5);
      });
    });

    describe('races', () => {
      it('stock 1 and two users at once: exactly one order, stock is 0, not negative', async () => {
        const productId = await seedProduct({ stock: 1 });
        const other = tokenFor(new Types.ObjectId().toString());
        await addToCart(productId, 1);
        await addToCart(productId, 1, other);

        const results = await Promise.all([checkout(), checkout({ shipping }, other)]);

        expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(await stockOf(productId)).toBe(0);
        expect(await orderModel.countDocuments()).toBe(1);
      });

      it('stock 5 and two requests for 3: one succeeds, stock is 2', async () => {
        const productId = await seedProduct({ stock: 5 });
        const other = tokenFor(new Types.ObjectId().toString());
        await addToCart(productId, 3);
        await addToCart(productId, 3, other);

        const results = await Promise.all([checkout(), checkout({ shipping }, other)]);

        expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(await stockOf(productId)).toBe(2);
        expect(await orderModel.countDocuments()).toBe(1);
      });

      it('ten users want the last 3 items (1 each): exactly 3 orders', async () => {
        const productId = await seedProduct({ stock: 3 });
        const tokens = Array.from({ length: 10 }, () => tokenFor(new Types.ObjectId().toString()));
        for (const t of tokens) {
          await addToCart(productId, 1, t);
        }

        const results = await Promise.all(tokens.map((t) => checkout({ shipping }, t)));

        const statuses = results.map((r) => r.status);
        expect(statuses.filter((s) => s === 201)).toHaveLength(3);
        expect(statuses.filter((s) => s === 409)).toHaveLength(7);
        expect(await stockOf(productId)).toBe(0);
        expect(await orderModel.countDocuments()).toBe(3);
      });

      it('two parallel checkouts of ONE user (enough stock for both): one 201, one 400, one order', async () => {
        const productId = await seedProduct({ stock: 10 });
        await addToCart(productId, 2);

        const results = await Promise.all([checkout(), checkout()]);

        expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
        expect(await orderModel.countDocuments({ userId })).toBe(1);
        expect(await stockOf(productId)).toBe(8);
        expect(await cartLines()).toBe(0);
        const rejected = results.find((r) => r.status === 400);
        expect(rejected?.body).toMatchObject({ message: 'The cart is empty' });
      });
    });

    describe('order number', () => {
      const seedExistingOrder = async (orderNumber: string): Promise<void> => {
        await orderModel.create({
          orderNumber,
          userId: new Types.ObjectId(),
          items: [
            {
              productId: new Types.ObjectId(),
              name: 'Old',
              slug: 'old',
              priceCents: 100,
              quantity: 1,
            },
          ],
          totalCents: 100,
          shipping,
        });
      };

      it('retries with a new number when the first one is taken', async () => {
        await seedExistingOrder('TS-261119-AAAAAA');
        generator.mockReturnValueOnce('TS-261119-AAAAAA').mockReturnValueOnce('TS-261119-BBBBBB');
        const productId = await seedProduct({ stock: 5 });
        await addToCart(productId, 2);

        const res = await checkout().expect(201);

        expect((res.body as OrderBody).orderNumber).toBe('TS-261119-BBBBBB');
        expect(generator).toHaveBeenCalledTimes(2);
        // The aborted first attempt must not leave anything behind
        expect(await stockOf(productId)).toBe(3);
        expect(await orderModel.countDocuments()).toBe(2);
        expect(await cartLines()).toBe(0);
      });

      it('gives a plain 500 after 3 taken numbers, logs the cause, changes nothing', async () => {
        await seedExistingOrder('TS-261119-AAAAAA');
        generator.mockReturnValue('TS-261119-AAAAAA');
        const productId = await seedProduct({ stock: 5 });
        await addToCart(productId, 2);

        const res = await checkout();

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' });
        expect(res.text).not.toContain('AAAAAA');
        expect(generator).toHaveBeenCalledTimes(3);
        expect(errorLog).toHaveBeenCalledWith(
          expect.stringContaining('Could not generate a unique order number'),
          expect.any(String),
        );
        expect(await stockOf(productId)).toBe(5);
        expect(await cartLines()).toBe(1);
        expect(await orderModel.countDocuments()).toBe(1);
      });
    });
  });

  describe('GET /api/orders', () => {
    const placeOrder = async (t: string = token): Promise<OrderBody> => {
      const productId = await seedProduct({ stock: 100 });
      await addToCart(productId, 1, t);
      return (await checkout({ shipping }, t).expect(201)).body as OrderBody;
    };

    it('returns an empty page for a user without orders', async () => {
      const res = await api().get('/api/orders').set(auth()).expect(200);

      expect(res.body).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    });

    it('returns only my orders, newest first, with pagination', async () => {
      const first = await placeOrder();
      const second = await placeOrder();
      const third = await placeOrder();
      await placeOrder(tokenFor(new Types.ObjectId().toString()));

      const page1 = (await api().get('/api/orders?limit=2&page=1').set(auth()).expect(200))
        .body as ListBody;
      const page2 = (await api().get('/api/orders?limit=2&page=2').set(auth()).expect(200))
        .body as ListBody;

      expect(page1).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(page1.items.map((o) => o.id)).toEqual([third.id, second.id]);
      expect(page2.items.map((o) => o.id)).toEqual([first.id]);
    });

    it('shows only own orders even to an admin', async () => {
      await placeOrder();
      const adminId = new Types.ObjectId().toString();
      const adminToken = tokenFor(adminId, 'admin');
      const own = await placeOrder(adminToken);

      const res = await api().get('/api/orders').set(auth(adminToken)).expect(200);

      expect((res.body as ListBody).items.map((o) => o.id)).toEqual([own.id]);
    });

    it('returns 400 for limit=51 and page=0', async () => {
      await api().get('/api/orders?limit=51').set(auth()).expect(400);
      await api().get('/api/orders?page=0').set(auth()).expect(400);
    });
  });

  describe('GET /api/orders/:id', () => {
    it('returns my order', async () => {
      const productId = await seedProduct();
      await addToCart(productId, 1);
      const placed = (await checkout().expect(201)).body as OrderBody;

      const res = await api().get(`/api/orders/${placed.id}`).set(auth()).expect(200);

      expect(res.body).toEqual(JSON.parse(JSON.stringify(placed)));
    });

    it("returns 404 for someone else's order, also for an admin", async () => {
      const productId = await seedProduct();
      await addToCart(productId, 1);
      const placed = (await checkout().expect(201)).body as OrderBody;
      const stranger = tokenFor(new Types.ObjectId().toString());
      const admin = tokenFor(new Types.ObjectId().toString(), 'admin');

      await api().get(`/api/orders/${placed.id}`).set(auth(stranger)).expect(404);
      await api().get(`/api/orders/${placed.id}`).set(auth(admin)).expect(404);
    });

    it('returns 404 for an unknown id and 400 for a malformed one', async () => {
      await api().get(`/api/orders/${new Types.ObjectId().toString()}`).set(auth()).expect(404);
      await api().get('/api/orders/123').set(auth()).expect(400);
    });
  });
});
