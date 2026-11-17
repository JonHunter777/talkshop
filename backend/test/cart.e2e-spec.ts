import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { Cart } from '../src/cart/schemas/cart.schema';
import { Product } from '../src/products/schemas/product.schema';
import { createTestApp } from './helpers/create-test-app';
import { dropTestDb } from './helpers/test-db';

interface CartLine {
  productId: string;
  quantity: number;
  available: boolean;
  exceedsStock: boolean;
  name: string | null;
  priceCents: number | null;
  stock: number | null;
  lineTotalCents: number;
}

interface CartBody {
  items: CartLine[];
  totalCents: number;
  currency: string;
  canCheckout: boolean;
}

describe('Cart API (e2e, in-memory MongoDB)', () => {
  let app: INestApplication<App>;
  let cartModel: Model<Cart>;
  let productModel: Model<Product>;
  let jwt: JwtService;
  let userId: string;
  let token: string;

  const tokenFor = (sub: string): string => jwt.sign({ sub, role: 'customer' });

  beforeAll(async () => {
    // createTestApp() runs syncIndexes() for every model, so the unique index on userId exists
    app = await createTestApp();
    cartModel = app.get<Model<Cart>>(getModelToken(Cart.name));
    productModel = app.get<Model<Product>>(getModelToken(Product.name));
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  beforeEach(async () => {
    await Promise.all([cartModel.deleteMany({}), productModel.deleteMany({})]);
    userId = new Types.ObjectId().toString();
    token = tokenFor(userId);
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

  const add = (productId: string, quantity: number, t?: string) =>
    api().post('/api/cart/items').set(auth(t)).send({ productId, quantity });
  const getCart = async (t?: string): Promise<CartBody> =>
    (await api().get('/api/cart').set(auth(t)).expect(200)).body as CartBody;

  it('has a unique index on userId', async () => {
    const indexes = await cartModel.collection.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: { userId: 1 }, unique: true })]),
    );
  });

  describe('authentication', () => {
    const id = new Types.ObjectId().toString();

    it.each([
      ['GET', '/api/cart'],
      ['POST', '/api/cart/items'],
      ['PATCH', `/api/cart/items/${id}`],
      ['DELETE', `/api/cart/items/${id}`],
      ['DELETE', '/api/cart'],
    ])('%s %s without a token returns 401', async (method, path) => {
      const res = await api()[method.toLowerCase() as 'get'](path);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/cart', () => {
    it('returns an empty cart and does NOT create a document', async () => {
      const cart = await getCart();

      expect(cart).toEqual({ items: [], totalCents: 0, currency: 'UAH', canCheckout: false });
      expect(await cartModel.countDocuments()).toBe(0);
    });

    it('does not show the cart of another user', async () => {
      const productId = await seedProduct();
      await add(productId, 2).expect(201);

      const other = await getCart(tokenFor(new Types.ObjectId().toString()));

      expect(other.items).toEqual([]);
    });
  });

  describe('POST /api/cart/items', () => {
    it('adds a product and returns the cart with prices from the product', async () => {
      const productId = await seedProduct({ priceCents: 2500, stock: 10 });

      const res = await add(productId, 2).expect(201);
      const cart = res.body as CartBody;

      expect(cart.items).toEqual([
        expect.objectContaining({
          productId,
          quantity: 2,
          available: true,
          exceedsStock: false,
          priceCents: 2500,
          lineTotalCents: 5000,
        }),
      ]);
      expect(cart).toMatchObject({ totalCents: 5000, canCheckout: true });
    });

    it('sums the quantity when the same product is added again', async () => {
      const productId = await seedProduct();

      await add(productId, 2).expect(201);
      const res = await add(productId, 3).expect(201);

      const cart = res.body as CartBody;
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]?.quantity).toBe(5);
    });

    it.each([0, 100, 1.5, '2', null])('returns 400 for quantity %p', async (quantity) => {
      const productId = await seedProduct();

      await api().post('/api/cart/items').set(auth()).send({ productId, quantity }).expect(400);
    });

    it('returns 400 for an invalid productId and for a userId in the body', async () => {
      const productId = await seedProduct();

      await add('nope', 1).expect(400);
      await api()
        .post('/api/cart/items')
        .set(auth())
        .send({ productId, quantity: 1, userId: new Types.ObjectId().toString() })
        .expect(400);
    });

    it('returns 404 for an unknown product and does not create a cart', async () => {
      await add(new Types.ObjectId().toString(), 1).expect(404);

      expect(await cartModel.countDocuments()).toBe(0);
    });

    it('allows exactly the stock and rejects more (counting what is already in the cart)', async () => {
      const productId = await seedProduct({ stock: 5 });

      await add(productId, 3).expect(201);
      await add(productId, 3).expect(409);
      await add(productId, 2).expect(201);

      expect((await getCart()).items[0]?.quantity).toBe(5);
    });

    it('returns 409 for a product with no stock', async () => {
      const productId = await seedProduct({ stock: 0 });

      await add(productId, 1).expect(409);
    });

    it('never goes above 99 per line', async () => {
      const productId = await seedProduct({ stock: 1000 });

      await add(productId, 99).expect(201);
      await add(productId, 1).expect(409);
    });

    it('returns 409 when the cart already has 50 lines, but still sums existing lines', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 50; i++) {
        ids.push(await seedProduct());
      }
      for (const id of ids) {
        await add(id, 1).expect(201);
      }
      const extra = await seedProduct();

      await add(extra, 1).expect(409);
      await add(ids[0], 1).expect(201);

      expect((await getCart()).items).toHaveLength(50);
    });

    it('keeps one line and the right sum for parallel adds of the same product', async () => {
      const productId = await seedProduct({ stock: 100 });

      const results = await Promise.all(Array.from({ length: 10 }, () => add(productId, 1)));

      expect(results.map((r) => r.status)).toEqual(Array<number>(10).fill(201));
      const cart = await getCart();
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]?.quantity).toBe(10);
      expect(await cartModel.countDocuments({ userId })).toBe(1);
    });

    it('does not put more in the cart than the stock allows under parallel adds', async () => {
      const productId = await seedProduct({ stock: 5 });

      const results = await Promise.all(Array.from({ length: 10 }, () => add(productId, 1)));

      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(5);
      expect(statuses.filter((s) => s === 409)).toHaveLength(5);
      expect((await getCart()).items[0]?.quantity).toBe(5);
    });

    it('keeps separate lines for parallel adds of different products', async () => {
      const ids = await Promise.all([seedProduct(), seedProduct(), seedProduct()]);

      const results = await Promise.all(ids.map((id) => add(id, 2)));

      expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
      expect((await getCart()).items.map((i) => i.quantity)).toEqual([2, 2, 2]);
    });
  });

  describe('prices, deleted products and stock changes', () => {
    it('takes prices from the product: a price change updates the total', async () => {
      const productId = await seedProduct({ priceCents: 1000 });
      await add(productId, 2).expect(201);

      await productModel.updateOne({ _id: productId }, { priceCents: 1500 });

      expect(await getCart()).toMatchObject({ totalCents: 3000 });
    });

    it('shows a deleted product as unavailable, leaves it out of the total, and it can be removed', async () => {
      const keep = await seedProduct({ priceCents: 1000 });
      const gone = await seedProduct({ priceCents: 5000 });
      await add(keep, 1).expect(201);
      await add(gone, 1).expect(201);

      await productModel.deleteOne({ _id: gone });
      const cart = await getCart();

      expect(cart.items).toEqual([
        expect.objectContaining({ productId: keep, available: true }),
        expect.objectContaining({
          productId: gone,
          available: false,
          name: null,
          priceCents: null,
          lineTotalCents: 0,
        }),
      ]);
      expect(cart).toMatchObject({ totalCents: 1000, canCheckout: false });

      const after = await api().delete(`/api/cart/items/${gone}`).set(auth()).expect(200);
      expect(after.body).toMatchObject({ canCheckout: true });
      expect((after.body as CartBody).items).toHaveLength(1);
    });

    it('marks exceedsStock when the stock dropped after adding, counts it in the total, blocks checkout', async () => {
      const productId = await seedProduct({ priceCents: 1000, stock: 10 });
      await add(productId, 5).expect(201);

      await productModel.updateOne({ _id: productId }, { stock: 2 });
      const cart = await getCart();

      expect(cart.items[0]).toMatchObject({ quantity: 5, exceedsStock: true, stock: 2 });
      expect(cart).toMatchObject({ totalCents: 5000, canCheckout: false });
    });

    it('canCheckout is true only for a non-empty cart without problems', async () => {
      expect((await getCart()).canCheckout).toBe(false);

      await add(await seedProduct({ stock: 3 }), 3).expect(201);

      expect((await getCart()).canCheckout).toBe(true);
    });
  });

  describe('PATCH /api/cart/items/:productId', () => {
    const patch = (productId: string, body: object) =>
      api().patch(`/api/cart/items/${productId}`).set(auth()).send(body);

    it('sets the new quantity (not an increment)', async () => {
      const productId = await seedProduct();
      await add(productId, 5).expect(201);

      const res = await patch(productId, { quantity: 2 }).expect(200);

      expect((res.body as CartBody).items[0]?.quantity).toBe(2);
    });

    it('returns 409 above the stock and keeps the old quantity', async () => {
      const productId = await seedProduct({ stock: 4 });
      await add(productId, 2).expect(201);

      await patch(productId, { quantity: 5 }).expect(409);

      expect((await getCart()).items[0]?.quantity).toBe(2);
    });

    it('returns 404 for a product that is not in the cart and for a deleted product', async () => {
      const inStock = await seedProduct();
      const gone = await seedProduct();
      await add(gone, 1).expect(201);
      await productModel.deleteOne({ _id: gone });

      await patch(inStock, { quantity: 1 }).expect(404);
      await patch(gone, { quantity: 1 }).expect(404);
    });

    it.each([0, 100, 1.5, null])('returns 400 for quantity %p', async (quantity) => {
      const productId = await seedProduct();
      await add(productId, 1).expect(201);

      await patch(productId, { quantity }).expect(400);
    });

    it('returns 400 for a malformed id and cannot touch another user cart', async () => {
      const productId = await seedProduct();
      await add(productId, 1).expect(201);

      await api().patch('/api/cart/items/123').set(auth()).send({ quantity: 1 }).expect(400);
      await api()
        .patch(`/api/cart/items/${productId}`)
        .set(auth(tokenFor(new Types.ObjectId().toString())))
        .send({ quantity: 5 })
        .expect(404);
      expect((await getCart()).items[0]?.quantity).toBe(1);
    });
  });

  describe('DELETE /api/cart/items/:productId', () => {
    it('removes the line and returns the cart', async () => {
      const a = await seedProduct();
      const b = await seedProduct();
      await add(a, 1).expect(201);
      await add(b, 1).expect(201);

      const res = await api().delete(`/api/cart/items/${a}`).set(auth()).expect(200);

      expect((res.body as CartBody).items.map((i) => i.productId)).toEqual([b]);
    });

    it('returns 404 for a line that is not in the cart and 400 for a malformed id', async () => {
      await api()
        .delete(`/api/cart/items/${new Types.ObjectId().toString()}`)
        .set(auth())
        .expect(404);
      await api().delete('/api/cart/items/123').set(auth()).expect(400);
    });
  });

  describe('DELETE /api/cart', () => {
    it('empties the cart (204) and can be repeated', async () => {
      await add(await seedProduct(), 2).expect(201);

      await api().delete('/api/cart').set(auth()).expect(204);
      await api().delete('/api/cart').set(auth()).expect(204);

      expect((await getCart()).items).toEqual([]);
    });

    it('does not touch the cart of another user', async () => {
      const otherToken = tokenFor(new Types.ObjectId().toString());
      await add(await seedProduct(), 1).expect(201);
      await add(await seedProduct(), 1, otherToken).expect(201);

      await api().delete('/api/cart').set(auth()).expect(204);

      expect((await getCart(otherToken)).items).toHaveLength(1);
    });
  });
});
