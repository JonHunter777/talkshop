// One customer journey through the whole shop API, on one database.
// The steps are CHAINED on purpose: each `it` continues where the previous one stopped,
// so when a step fails, the following ones can fail too. Do not run a single step with `-t`.
//
// Rate limiting stays ON (`throttle: true`). The auth routes allow 5 requests per minute each:
// this file sends 2 registrations and 2 logins. Keep new steps within that limit.
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ORDER_NUMBER_REGEX } from '../src/orders/order-number';
import { createAdmin } from './helpers/create-admin';
import { createTestApp } from './helpers/create-test-app';
import { dropTestDb } from './helpers/test-db';

interface AuthBody {
  accessToken: string;
  user: { id: string; email: string; name: string; role: string };
}

interface ProductBody {
  id: string;
  slug: string;
  priceCents: number;
  stock: number;
}

interface CartBody {
  items: { productId: string; quantity: number; priceCents: number; lineTotalCents: number }[];
  totalCents: number;
}

interface OrderBody {
  id: string;
  userId?: string;
  orderNumber: string;
  items: { productId: string; slug: string; priceCents: number; quantity: number }[];
  totalCents: number;
  status: string;
}

interface ListBody<T> {
  items: T[];
  total: number;
}

const BUYER = {
  email: 'buyer@example.com',
  password: 'correct-horse-battery',
  name: 'Buyer',
};

const STRANGER = {
  email: 'stranger@example.com',
  password: 'another-long-passphrase',
  name: 'Stranger',
};

const TABLECLOTH = {
  name: 'Linen tablecloth',
  slug: 'linen-tablecloth',
  description: 'Soft linen for everyday use.',
  category: 'textile',
  priceCents: 129900,
  stock: 10,
};

const MUG = {
  name: 'Clay mug',
  slug: 'clay-mug',
  description: 'A mug made of clay.',
  category: 'kitchen',
  priceCents: 25000,
  stock: 5,
};

// The admin raises the mug price while the mug is already in the cart
const NEW_MUG_PRICE_CENTS = 27500;

const SHIPPING = {
  fullName: 'Ivan Petrenko',
  phone: '+380 (50) 123-45-67',
  city: 'Kyiv',
  address: 'Khreshchatyk St, 1',
};

// Paths of all keys that look like a password, at any depth of a response body
function findPasswordKeys(value: unknown, path = 'body'): string[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => [
    ...(/password/i.test(key) ? [`${path}.${key}`] : []),
    ...findPasswordKeys(child, `${path}.${key}`),
  ]);
}

describe('Shop flow: register -> catalog -> cart -> checkout -> order status (e2e)', () => {
  let app: INestApplication<App>;

  // State passed from one step to the next
  let adminToken: string;
  let buyerId: string;
  let buyerToken: string;
  let strangerToken: string;
  let tableclothId: string;
  let mugId: string;
  let orderId: string;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  // Every response of this file goes through here: checks the status code and that
  // no password or password hash is anywhere in the body.
  const send = async <T>(req: request.Test, status: number): Promise<T> => {
    const res = await req.expect(status);
    expect(findPasswordKeys(res.body)).toEqual([]);
    return res.body as T;
  };

  const getProduct = (id: string) => send<ProductBody>(api().get(`/api/products/${id}`), 200);
  const getCart = () => send<CartBody>(api().get('/api/cart').set(bearer(buyerToken)), 200);
  const getMyOrders = (token: string) =>
    send<ListBody<OrderBody>>(api().get('/api/orders').set(bearer(token)), 200);
  const getMyOrder = (token: string) =>
    send<OrderBody>(api().get(`/api/orders/${orderId}`).set(bearer(token)), 200);

  const addToCart = (productId: string, quantity: number, status = 201) =>
    send<CartBody>(
      api().post('/api/cart/items').set(bearer(buyerToken)).send({ productId, quantity }),
      status,
    );
  const updateProduct = (id: string, changes: object) =>
    send<ProductBody>(
      api().patch(`/api/products/${id}`).set(bearer(adminToken)).send(changes),
      200,
    );

  beforeAll(async () => {
    app = await createTestApp({ throttle: true });
    // Admins cannot register through the API: the helper inserts one into the database
    adminToken = (await createAdmin(app)).token;
    const create = (product: object) =>
      send<ProductBody>(api().post('/api/products').set(bearer(adminToken)).send(product), 201);
    tableclothId = (await create(TABLECLOTH)).id;
    mugId = (await create(MUG)).id;
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  it('registers a new customer', async () => {
    const body = await send<AuthBody>(api().post('/api/auth/register').send(BUYER), 201);

    expect(body.user).toMatchObject({ email: BUYER.email, name: BUYER.name, role: 'customer' });
    buyerId = body.user.id;
  });

  it('logs in and gets a token that identifies the same user', async () => {
    const login = await send<AuthBody>(
      api().post('/api/auth/login').send({ email: BUYER.email, password: BUYER.password }),
      200,
    );
    buyerToken = login.accessToken;

    const me = await send<AuthBody['user']>(api().get('/api/auth/me').set(bearer(buyerToken)), 200);
    expect(me).toMatchObject({ id: buyerId, email: BUYER.email, role: 'customer' });
  });

  it('shows the products in the public catalog and filters them by category', async () => {
    const all = await send<ListBody<ProductBody>>(api().get('/api/products'), 200);
    expect(all.total).toBe(2);
    expect(all.items.map((item) => item.id).sort()).toEqual([tableclothId, mugId].sort());

    const kitchen = await send<ListBody<ProductBody>>(
      api().get('/api/products').query({ category: 'kitchen' }),
      200,
    );
    expect(kitchen.items.map((item) => item.id)).toEqual([mugId]);
  });

  it('shows one product by id and by slug', async () => {
    const byId = await getProduct(tableclothId);
    expect(byId).toMatchObject({
      slug: TABLECLOTH.slug,
      priceCents: TABLECLOTH.priceCents,
      stock: TABLECLOTH.stock,
    });

    const bySlug = await send<ProductBody>(api().get(`/api/products/slug/${MUG.slug}`), 200);
    expect(bySlug).toMatchObject({ id: mugId, priceCents: MUG.priceCents, stock: MUG.stock });
  });

  it('answers 401 without a token on cart and order routes', async () => {
    await send(api().get('/api/cart'), 401);
    await send(api().post('/api/cart/items').send({ productId: mugId, quantity: 1 }), 401);
    await send(api().post('/api/orders').send({ shipping: SHIPPING }), 401);
    await send(api().get('/api/orders'), 401);
    await send(api().get('/api/orders/all'), 401);
  });

  it('answers 400 for a checkout with an empty cart', async () => {
    const body = await send(
      api().post('/api/orders').set(bearer(buyerToken)).send({ shipping: SHIPPING }),
      400,
    );

    expect(body).toMatchObject({ message: 'The cart is empty' });
  });

  it('adds two products to the cart and changes a quantity', async () => {
    await addToCart(tableclothId, 1);
    await addToCart(mugId, 1);

    const cart = await send<CartBody>(
      api().patch(`/api/cart/items/${tableclothId}`).set(bearer(buyerToken)).send({ quantity: 3 }),
      200,
    );

    expect(cart.items).toMatchObject([
      { productId: tableclothId, quantity: 3, lineTotalCents: 3 * TABLECLOTH.priceCents },
      { productId: mugId, quantity: 1, lineTotalCents: MUG.priceCents },
    ]);
    expect(cart.totalCents).toBe(3 * TABLECLOTH.priceCents + MUG.priceCents);
  });

  it('answers 409 when adding more than the stock and keeps the cart as it was', async () => {
    const before = await getCart();

    // One mug is already in the cart, so the whole stock on top of it is too much
    await addToCart(mugId, MUG.stock, 409);

    expect(await getCart()).toEqual(before);
  });

  it('rejects a price sent by the client at checkout', async () => {
    const before = await getCart();

    await send(
      api().post('/api/orders').set(bearer(buyerToken)).send({ shipping: SHIPPING, totalCents: 1 }),
      400,
    );

    expect(await getCart()).toEqual(before);
    expect((await getMyOrders(buyerToken)).total).toBe(0);
  });

  it('places an order with the prices the server has at checkout time', async () => {
    await updateProduct(mugId, { priceCents: NEW_MUG_PRICE_CENTS });

    const order = await send<OrderBody>(
      api().post('/api/orders').set(bearer(buyerToken)).send({ shipping: SHIPPING }),
      201,
    );
    orderId = order.id;

    expect(order.orderNumber).toMatch(ORDER_NUMBER_REGEX);
    expect(order.status).toBe('pending');
    expect(order.items).toMatchObject([
      { productId: tableclothId, quantity: 3, priceCents: TABLECLOTH.priceCents },
      { productId: mugId, quantity: 1, priceCents: NEW_MUG_PRICE_CENTS },
    ]);
    expect(order.totalCents).toBe(3 * TABLECLOTH.priceCents + NEW_MUG_PRICE_CENTS);
  });

  it('decreases the stock and empties the cart after checkout', async () => {
    expect((await getProduct(tableclothId)).stock).toBe(TABLECLOTH.stock - 3);
    expect((await getProduct(mugId)).stock).toBe(MUG.stock - 1);

    const cart = await getCart();
    expect(cart.items).toEqual([]);
    expect(cart.totalCents).toBe(0);
  });

  it('shows the order in "my orders", in the list and by id', async () => {
    const list = await getMyOrders(buyerToken);
    expect(list.total).toBe(1);
    expect(list.items.map((order) => order.id)).toEqual([orderId]);

    const order = await getMyOrder(buyerToken);
    expect(order).toMatchObject({ id: orderId, status: 'pending' });
  });

  it('hides the order from another customer', async () => {
    const stranger = await send<AuthBody>(api().post('/api/auth/register').send(STRANGER), 201);
    const login = await send<AuthBody>(
      api().post('/api/auth/login').send({ email: STRANGER.email, password: STRANGER.password }),
      200,
    );
    expect(login.user.id).toBe(stranger.user.id);
    strangerToken = login.accessToken;

    expect(await getMyOrders(strangerToken)).toMatchObject({ items: [], total: 0 });
    await send(api().get(`/api/orders/${orderId}`).set(bearer(strangerToken)), 404);
  });

  it('answers 403 when a customer tries to change the order status', async () => {
    await send(
      api()
        .patch(`/api/orders/${orderId}/status`)
        .set(bearer(buyerToken))
        .send({ status: 'processing' }),
      403,
    );
    await send(api().patch(`/api/orders/${orderId}/status`).send({ status: 'processing' }), 401);

    expect((await getMyOrder(buyerToken)).status).toBe('pending');
  });

  it('shows the order with its owner to the admin in /orders/all', async () => {
    const list = await send<ListBody<OrderBody>>(
      api().get('/api/orders/all').set(bearer(adminToken)),
      200,
    );

    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ id: orderId, userId: buyerId, status: 'pending' });
  });

  it('lets the admin change the status and shows the new status to the customer', async () => {
    const updated = await send<OrderBody>(
      api()
        .patch(`/api/orders/${orderId}/status`)
        .set(bearer(adminToken))
        .send({ status: 'processing' }),
      200,
    );
    expect(updated.status).toBe('processing');

    expect((await getMyOrder(buyerToken)).status).toBe('processing');
    expect((await getMyOrders(buyerToken)).items[0]?.status).toBe('processing');
  });

  it('answers 409 with the problem lines and changes nothing when the stock ran out', async () => {
    // The first line still fits, the second one will not: the first must be rolled back too
    await addToCart(tableclothId, 2);
    await addToCart(mugId, 3);
    await updateProduct(mugId, { stock: 1 });
    const cartBefore = await getCart();
    const tableclothStockBefore = (await getProduct(tableclothId)).stock;

    const body = await send(
      api().post('/api/orders').set(bearer(buyerToken)).send({ shipping: SHIPPING }),
      409,
    );

    expect(body).toEqual({
      statusCode: 409,
      message: 'Some items in the cart cannot be ordered',
      items: [{ productId: mugId, reason: 'insufficient_stock', requested: 3, available: 1 }],
    });
    expect((await getProduct(tableclothId)).stock).toBe(tableclothStockBefore);
    expect((await getProduct(mugId)).stock).toBe(1);
    expect(await getCart()).toEqual(cartBefore);
    expect((await getMyOrders(buyerToken)).total).toBe(1);
  });
});
