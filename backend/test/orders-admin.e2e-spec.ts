import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import type { OrderStatus } from '../src/common/constants/shop';
import { generateOrderNumber } from '../src/orders/order-number';
import { Order } from '../src/orders/schemas/order.schema';
import { User } from '../src/users/schemas/user.schema';
import { createAdmin, type TestAdmin } from './helpers/create-admin';
import { createTestApp } from './helpers/create-test-app';
import { dropTestDb } from './helpers/test-db';

interface AdminOrderBody {
  id: string;
  orderNumber: string;
  status: string;
  userId?: string;
  totalCents: number;
}

interface ListBody {
  items: AdminOrderBody[];
  total: number;
  page: number;
  limit: number;
}

const shipping = {
  fullName: 'Ivan Petrenko',
  phone: '+380 (50) 123-45-67',
  city: 'Kyiv',
  address: 'Khreshchatyk St, 1',
};

describe('Admin orders API (e2e, in-memory MongoDB)', () => {
  let app: INestApplication<App>;
  let orderModel: Model<Order>;
  let userModel: Model<User>;
  let jwt: JwtService;
  let admin: TestAdmin;

  beforeAll(async () => {
    app = await createTestApp();
    orderModel = app.get<Model<Order>>(getModelToken(Order.name));
    userModel = app.get<Model<User>>(getModelToken(User.name));
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  beforeEach(async () => {
    await orderModel.deleteMany({});
    // A fresh admin per test: some tests demote or delete it
    admin = await createAdmin(app);
  });

  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const customerToken = (id: string = new Types.ObjectId().toString()): string =>
    jwt.sign({ sub: id, role: 'customer' });

  // Inserts an order directly: faster than a real checkout, and the status can be chosen
  const seedOrder = async (
    userId: string,
    status: OrderStatus = 'pending',
  ): Promise<{ id: string; orderNumber: string }> => {
    const order = await orderModel.create({
      orderNumber: generateOrderNumber(),
      userId,
      items: [
        {
          productId: new Types.ObjectId(),
          name: 'Cup',
          slug: 'cup',
          priceCents: 700,
          quantity: 2,
        },
      ],
      totalCents: 1400,
      shipping,
      status,
    });
    return { id: order.id as string, orderNumber: order.orderNumber };
  };

  const newUserId = (): string => new Types.ObjectId().toString();

  describe('access', () => {
    const id = new Types.ObjectId().toString();

    it.each([['/api/orders/all'], [`/api/orders/all/${id}`]])(
      'GET %s without a token returns 401',
      async (path) => {
        await api().get(path).expect(401);
      },
    );

    // 403 (not 400) also proves that `all` is not swallowed by the `:id` route
    it.each([['/api/orders/all'], [`/api/orders/all/${id}`]])(
      'GET %s returns 403 for a customer',
      async (path) => {
        await api().get(path).set(auth(customerToken())).expect(403);
      },
    );

    it.each([['/api/orders/all'], [`/api/orders/all/${id}`]])(
      'GET %s returns 403 for a token admin who was demoted in the database',
      async (path) => {
        await userModel.updateOne({ _id: admin.id }, { role: 'customer' });

        await api().get(path).set(auth(admin.token)).expect(403);
      },
    );

    it.each([['/api/orders/all'], [`/api/orders/all/${id}`]])(
      'GET %s returns 401 for a token admin whose user was deleted',
      async (path) => {
        await userModel.deleteOne({ _id: admin.id });

        await api().get(path).set(auth(admin.token)).expect(401);
      },
    );
  });

  describe('GET /api/orders/all', () => {
    it('returns an empty page when there are no orders', async () => {
      const res = await api().get('/api/orders/all').set(auth(admin.token)).expect(200);

      expect(res.body).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    });

    it('returns the orders of ALL users, newest first, with the owner', async () => {
      const userA = newUserId();
      const userB = newUserId();
      const first = await seedOrder(userA);
      const second = await seedOrder(userB);
      const third = await seedOrder(userA);

      const res = await api().get('/api/orders/all').set(auth(admin.token)).expect(200);

      const body = res.body as ListBody;
      expect(body.total).toBe(3);
      expect(body.items.map((o) => o.id)).toEqual([third.id, second.id, first.id]);
      expect(body.items.map((o) => o.userId)).toEqual([userA, userB, userA]);
    });

    it('filters by status and counts only the matching orders', async () => {
      const user = newUserId();
      await seedOrder(user, 'pending');
      const shipped = await seedOrder(user, 'shipped');
      await seedOrder(user, 'delivered');
      const shipped2 = await seedOrder(newUserId(), 'shipped');

      const res = await api()
        .get('/api/orders/all?status=shipped')
        .set(auth(admin.token))
        .expect(200);

      const body = res.body as ListBody;
      expect(body.total).toBe(2);
      expect(body.items.map((o) => o.id)).toEqual([shipped2.id, shipped.id]);
    });

    it('paginates without repeating or skipping orders', async () => {
      const user = newUserId();
      const created: string[] = [];
      for (let i = 0; i < 5; i++) {
        created.push((await seedOrder(user)).id);
      }

      const page1 = (await api().get('/api/orders/all?limit=2&page=1').set(auth(admin.token)))
        .body as ListBody;
      const page2 = (await api().get('/api/orders/all?limit=2&page=2').set(auth(admin.token)))
        .body as ListBody;
      const page3 = (await api().get('/api/orders/all?limit=2&page=3').set(auth(admin.token)))
        .body as ListBody;

      const ids = [...page1.items, ...page2.items, ...page3.items].map((o) => o.id);
      expect(ids).toEqual([...created].reverse());
      expect(page1).toMatchObject({ total: 5, page: 1, limit: 2 });
      expect(page3.items).toHaveLength(1);
    });

    it.each([
      ['limit=51', 'limit=51'],
      ['page=0', 'page=0'],
      ['an unknown status', 'status=refunded'],
      ['a status passed as an operator object', 'status[$ne]=pending'],
      ['a status passed twice', 'status=pending&status=shipped'],
    ])('returns 400 for %s', async (_name, query) => {
      await api().get(`/api/orders/all?${query}`).set(auth(admin.token)).expect(400);
    });

    // The point of the two indexes: the list is read in index order, without sorting in memory
    describe('query plan (explain)', () => {
      beforeEach(async () => {
        const user = newUserId();
        const statuses: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];
        for (const status of statuses) {
          await seedOrder(user, status);
          await seedOrder(newUserId(), status);
        }
      });

      it('reads the list without a status filter from an index, without a SORT stage', async () => {
        const plan = await orderModel
          .find({})
          .sort({ createdAt: -1, _id: -1 })
          .explain('queryPlanner');

        const text = JSON.stringify(plan);
        expect(text).toContain('IXSCAN');
        expect(text).not.toContain('"stage":"SORT"');
        expect(text).not.toContain('"stage":"COLLSCAN"');
      });

      it('reads the list with a status filter from an index, without a SORT stage', async () => {
        const plan = await orderModel
          .find({ status: 'shipped' })
          .sort({ createdAt: -1, _id: -1 })
          .explain('queryPlanner');

        const text = JSON.stringify(plan);
        expect(text).toContain('IXSCAN');
        expect(text).not.toContain('"stage":"SORT"');
        expect(text).not.toContain('"stage":"COLLSCAN"');
      });
    });
  });

  describe('GET /api/orders/all/:id', () => {
    it("shows someone else's order to an admin, with the owner", async () => {
      const owner = newUserId();
      const order = await seedOrder(owner);

      const res = await api().get(`/api/orders/all/${order.id}`).set(auth(admin.token)).expect(200);

      expect(res.body).toMatchObject({
        id: order.id,
        orderNumber: order.orderNumber,
        userId: owner,
        totalCents: 1400,
      });
    });

    it('returns 404 for an unknown id and 400 for a malformed one', async () => {
      await api()
        .get(`/api/orders/all/${new Types.ObjectId().toString()}`)
        .set(auth(admin.token))
        .expect(404);
      await api().get('/api/orders/all/123').set(auth(admin.token)).expect(400);
    });
  });

  describe('GET /api/orders/:id stays "own orders only" for every role', () => {
    it("returns 404 for someone else's order, also for an admin", async () => {
      const order = await seedOrder(newUserId());

      await api().get(`/api/orders/${order.id}`).set(auth(admin.token)).expect(404);
    });

    it('returns an admin their own order, WITHOUT the owner field', async () => {
      const order = await seedOrder(admin.id);

      const res = await api().get(`/api/orders/${order.id}`).set(auth(admin.token)).expect(200);

      expect(res.body).toMatchObject({ id: order.id });
      expect(res.body).not.toHaveProperty('userId');
    });

    it('returns 404 for a customer asking for someone else’s order', async () => {
      const order = await seedOrder(newUserId());

      await api().get(`/api/orders/${order.id}`).set(auth(customerToken())).expect(404);
    });
  });

  describe('GET /api/orders stays "own orders only" for an admin', () => {
    it('does not list other users orders', async () => {
      await seedOrder(newUserId());
      const own = await seedOrder(admin.id);

      const res = await api().get('/api/orders').set(auth(admin.token)).expect(200);

      expect((res.body as ListBody).items.map((o) => o.id)).toEqual([own.id]);
    });
  });
});
