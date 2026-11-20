import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { join } from 'node:path';
import mongoose, { Connection, Model } from 'mongoose';
import { Product, ProductSchema } from '../src/products/schemas/product.schema';
import { runSeed, SeedDataError, type SeedProduct, type SeedResult } from '../src/seed/run-seed';
import type { SeedConfig } from '../src/seed/seed-guard';
import { User, UserSchema } from '../src/users/schemas/user.schema';
import { buildTestDbUri, dropTestDbConnection } from './helpers/test-db';

const products = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'seed', 'data', 'products.json'), 'utf8'),
) as SeedProduct[];

const PRODUCT_COUNT = 42;
const ADMIN_PASSWORD = 'SeedAdminPwd#2024';
const USER_PASSWORD = 'SeedUserPwd#2024';

const config: SeedConfig = {
  admin: { email: 'seed-admin@seed-test.example.invalid', password: ADMIN_PASSWORD },
  user: { email: 'seed-demo@seed-test.example.invalid', password: USER_PASSWORD },
};

const FOREIGN_COLLECTION = 'seed_foreign_probe';

describe('runSeed (integration, in-memory MongoDB)', () => {
  let connection: Connection;
  let productModel: Model<Product>;
  let userModel: Model<User>;
  // Hash of a known password, used to prove that the seed never overwrites a password
  let knownHash: string;

  beforeAll(async () => {
    connection = await mongoose.createConnection(buildTestDbUri()).asPromise();
    productModel = connection.model(Product.name, ProductSchema);
    userModel = connection.model(User.name, UserSchema);
    knownHash = await bcrypt.hash('KnownOldPassword#1', 4);
  });

  afterAll(async () => {
    await dropTestDbConnection(connection);
    await connection.close();
  });

  async function clearAll(): Promise<void> {
    await productModel.deleteMany({});
    await userModel.deleteMany({});
    await connection.collection(FOREIGN_COLLECTION).deleteMany({});
  }

  it('has exactly 42 products in the data file (the expectations below rely on it)', () => {
    expect(products).toHaveLength(PRODUCT_COUNT);
  });

  describe('first run, manual changes, second run', () => {
    let first: SeedResult;
    let second: SeedResult;
    let spies: jest.SpyInstance[];

    // State captured between the runs
    let adminAfterFirst: { role: string; passwordHash: string } | null;
    let demoAfterFirst: { role: string; passwordHash: string } | null;
    let productsCountAfterFirst: number;
    let usersCountAfterFirst: number;
    let idsAfterFirst: Map<string, { id: string; createdAt: number }>;
    let changedStockSlug: string;
    let changedPriceSlug: string;
    let originalPriceCents: number;
    const EXTRA_SLUG = 'extra-product-not-from-seed';
    const EXTRA_EMAIL = 'extra-user@seed-test.example.invalid';

    beforeAll(async () => {
      await clearAll();
      await connection.collection(FOREIGN_COLLECTION).insertOne({ marker: 'must-survive' });

      // Any network call during the seed would be a bug (Mongo goes through net, not http)
      spies = [
        jest.spyOn(globalThis, 'fetch'),
        jest.spyOn(http, 'request'),
        jest.spyOn(https, 'request'),
      ];

      first = await runSeed(connection, products, config);

      productsCountAfterFirst = await productModel.countDocuments();
      usersCountAfterFirst = await userModel.countDocuments();
      adminAfterFirst = await userModel
        .findOne({ email: config.admin.email })
        .select('+passwordHash role')
        .lean();
      demoAfterFirst = await userModel
        .findOne({ email: config.user.email })
        .select('+passwordHash role')
        .lean();
      const stored = await productModel.find().lean();
      idsAfterFirst = new Map(
        stored.map((p) => [p.slug, { id: String(p._id), createdAt: p.createdAt.getTime() }]),
      );

      // Manual changes between the runs
      changedStockSlug = products[0].slug;
      changedPriceSlug = products[1].slug;
      originalPriceCents = products[1].priceCents;
      await productModel.updateOne({ slug: changedStockSlug }, { $set: { stock: 7 } });
      await productModel.updateOne({ slug: changedPriceSlug }, { $set: { priceCents: 1 } });
      await productModel.create({ ...products[2], slug: EXTRA_SLUG });
      await userModel.create({
        email: EXTRA_EMAIL,
        passwordHash: knownHash,
        name: 'Extra User',
        role: 'customer',
      });
      await userModel.updateOne(
        { email: config.admin.email },
        { $set: { passwordHash: knownHash } },
      );

      second = await runSeed(connection, products, config);
    });

    afterAll(() => {
      for (const spy of spies) {
        spy.mockRestore();
      }
    });

    it('first run creates 42 products and updates none', () => {
      expect(first.productsCreated).toBe(PRODUCT_COUNT);
      expect(first.productsUpdated).toBe(0);
    });

    it('first run stores exactly 42 products', () => {
      expect(productsCountAfterFirst).toBe(PRODUCT_COUNT);
    });

    it('first run creates 2 users and skips none', () => {
      expect(first.usersCreated).toBe(2);
      expect(first.usersSkipped).toBe(0);
      expect(first.roleMismatch).toEqual([]);
      expect(usersCountAfterFirst).toBe(2);
    });

    it('gives the admin the admin role and the demo user the customer role', () => {
      expect(adminAfterFirst?.role).toBe('admin');
      expect(demoAfterFirst?.role).toBe('customer');
    });

    it('stores bcrypt hashes, not plain passwords', async () => {
      expect(adminAfterFirst?.passwordHash).not.toBe(ADMIN_PASSWORD);
      expect(demoAfterFirst?.passwordHash).not.toBe(USER_PASSWORD);
      expect(await bcrypt.compare(ADMIN_PASSWORD, adminAfterFirst?.passwordHash ?? '')).toBe(true);
      expect(await bcrypt.compare(USER_PASSWORD, demoAfterFirst?.passwordHash ?? '')).toBe(true);
    });

    it('creates the unique slug index: a duplicate slug is rejected with E11000', async () => {
      await expect(productModel.collection.insertOne({ ...products[0] })).rejects.toMatchObject({
        code: 11000,
      });
    });

    it('creates the unique email index: a duplicate email is rejected with E11000', async () => {
      await expect(
        userModel.collection.insertOne({
          email: config.user.email,
          passwordHash: knownHash,
          name: 'Duplicate',
          role: 'customer',
        }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it('second run updates 42 existing products and creates none', () => {
      expect(second.productsCreated).toBe(0);
      expect(second.productsUpdated).toBe(PRODUCT_COUNT);
    });

    it('second run creates no users and skips both', () => {
      expect(second.usersCreated).toBe(0);
      expect(second.usersSkipped).toBe(2);
      expect(second.roleMismatch).toEqual([]);
    });

    it('deletes nothing: the extra product stays after the second run', async () => {
      expect(await productModel.countDocuments()).toBe(PRODUCT_COUNT + 1);
      expect(await productModel.exists({ slug: EXTRA_SLUG })).not.toBeNull();
    });

    it('deletes nothing: the extra user stays after the second run', async () => {
      expect(await userModel.countDocuments()).toBe(3);
      expect(await userModel.exists({ email: EXTRA_EMAIL })).not.toBeNull();
    });

    it('does not reset the stock that was changed by hand', async () => {
      const product = await productModel.findOne({ slug: changedStockSlug }).lean();
      expect(product?.stock).toBe(7);
    });

    it('restores the content (priceCents) from the JSON file', async () => {
      const product = await productModel.findOne({ slug: changedPriceSlug }).lean();
      expect(product?.priceCents).toBe(originalPriceCents);
    });

    it('does not overwrite the password of an existing user', async () => {
      const admin = await userModel
        .findOne({ email: config.admin.email })
        .select('+passwordHash')
        .lean();
      expect(admin?.passwordHash).toBe(knownHash);
    });

    it('does not change the roles of existing users', async () => {
      const admin = await userModel.findOne({ email: config.admin.email }).lean();
      const demo = await userModel.findOne({ email: config.user.email }).lean();
      expect(admin?.role).toBe('admin');
      expect(demo?.role).toBe('customer');
    });

    it('keeps _id and createdAt of products between the runs', async () => {
      const stored = await productModel.find({ slug: { $ne: EXTRA_SLUG } }).lean();
      expect(stored).toHaveLength(PRODUCT_COUNT);
      for (const product of stored) {
        expect({ id: String(product._id), createdAt: product.createdAt.getTime() }).toEqual(
          idsAfterFirst.get(product.slug),
        );
      }
    });

    it('does not touch a foreign collection', async () => {
      const docs = await connection.collection(FOREIGN_COLLECTION).find().toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].marker).toBe('must-survive');
    });

    it('makes no network calls (fetch, http.request, https.request)', () => {
      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    });
  });

  describe('existing user with the admin email but another role', () => {
    let result: SeedResult;

    beforeAll(async () => {
      await clearAll();
      await userModel.create({
        email: config.admin.email,
        passwordHash: knownHash,
        name: 'Existing Customer',
        role: 'customer',
      });
      result = await runSeed(connection, products, config);
    });

    it('reports roleMismatch for the admin account', () => {
      expect(result.roleMismatch).toEqual(['admin']);
    });

    it('skips the existing user and creates only the demo user', () => {
      expect(result.usersSkipped).toBe(1);
      expect(result.usersCreated).toBe(1);
    });

    it('keeps the customer role of the existing user', async () => {
      const user = await userModel.findOne({ email: config.admin.email }).lean();
      expect(user?.role).toBe('customer');
    });

    it('does not overwrite the password of the existing user', async () => {
      const user = await userModel
        .findOne({ email: config.admin.email })
        .select('+passwordHash')
        .lean();
      expect(user?.passwordHash).toBe(knownHash);
    });
  });

  describe('validation before any write', () => {
    beforeEach(async () => {
      await clearAll();
    });

    async function expectNothingWritten(): Promise<void> {
      expect(await productModel.countDocuments()).toBe(0);
      expect(await userModel.countDocuments()).toBe(0);
    }

    it('throws SeedDataError for a fractional price and writes nothing', async () => {
      const bad = products[products.length - 1];
      const data = [...products.slice(0, -1), { ...bad, priceCents: 10.5 }];

      const error = await runSeed(connection, data, config).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SeedDataError);
      expect((error as Error).name).toBe('SeedDataError');
      expect((error as Error).message).toBe(
        `Invalid product (slug "${bad.slug}"), fields: priceCents`,
      );
      expect((error as Error).message).not.toContain(bad.description);
      await expectNothingWritten();
    });

    it('throws SeedDataError for an unknown category and writes nothing', async () => {
      const bad = products[products.length - 1];
      const data = [
        ...products.slice(0, -1),
        { ...bad, category: 'bogus' as SeedProduct['category'] },
      ];

      const error = await runSeed(connection, data, config).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SeedDataError);
      expect((error as Error).message).toBe(
        `Invalid product (slug "${bad.slug}"), fields: category`,
      );
      await expectNothingWritten();
    });

    it('throws SeedDataError for a duplicate slug and writes nothing', async () => {
      const data = [
        ...products.slice(0, -1),
        { ...products[products.length - 1], slug: products[0].slug },
      ];

      const error = await runSeed(connection, data, config).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SeedDataError);
      expect((error as Error).message).toBe(
        `Duplicate product (slug "${products[0].slug}"): field slug`,
      );
      await expectNothingWritten();
    });
  });

  // A fresh EMPTY database and a connection created WITHOUT autoIndex / autoCreate options:
  // the protection must live in runSeed itself, not in how the connection is configured.
  describe('failed validation on a fresh empty database', () => {
    let freshConnection: Connection;

    beforeEach(async () => {
      const freshDbName = `e2e_${randomBytes(6).toString('hex')}`;
      freshConnection = await mongoose
        .createConnection(buildTestDbUri(undefined, freshDbName))
        .asPromise();
    });

    afterEach(async () => {
      await dropTestDbConnection(freshConnection);
      await freshConnection.close();
    });

    async function listCollectionNames(target: Connection): Promise<string[]> {
      if (!target.db) {
        throw new Error('The connection has no database handle');
      }
      const collections = await target.db.listCollections().toArray();
      return collections.map((c) => c.name);
    }

    // Mongoose would create collections and indexes in the background, so one check right
    // after the error proves nothing. We look several times over a bounded window (6 x 50 ms).
    // Indexes live inside collections: no collection means no indexes.
    async function expectDatabaseStaysEmpty(target: Connection): Promise<void> {
      for (let attempt = 0; attempt < 6; attempt++) {
        expect(await listCollectionNames(target)).toEqual([]);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    it('creates no collections and no indexes after an invalid product', async () => {
      const bad = products[products.length - 1];
      const data = [...products.slice(0, -1), { ...bad, priceCents: 10.5 }];

      await expect(runSeed(freshConnection, data, config)).rejects.toBeInstanceOf(SeedDataError);

      await expectDatabaseStaysEmpty(freshConnection);
    });

    it('creates no collections and no indexes after a duplicate slug', async () => {
      const data = [
        ...products.slice(0, -1),
        { ...products[products.length - 1], slug: products[0].slug },
      ];

      await expect(runSeed(freshConnection, data, config)).rejects.toBeInstanceOf(SeedDataError);

      await expectDatabaseStaysEmpty(freshConnection);
    });

    // Control: proves that the check above can notice a background creation at all
    it('control: a plain model without the seed protection does create its collection', async () => {
      freshConnection.model(Product.name, ProductSchema);

      const deadline = Date.now() + 5000;
      let names = await listCollectionNames(freshConnection);
      while (!names.includes('products') && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        names = await listCollectionNames(freshConnection);
      }

      expect(names).toContain('products');
    });
  });

  describe('two parallel runs on one empty database', () => {
    let results: SeedResult[] | undefined;
    let failure: unknown;

    beforeAll(async () => {
      await clearAll();
      try {
        results = await Promise.all([
          runSeed(connection, products, config),
          runSeed(connection, products, config),
        ]);
      } catch (error) {
        failure = error;
      }
    });

    it('does not fail', () => {
      expect(failure).toBeUndefined();
      expect(results).toHaveLength(2);
    });

    it('creates no duplicate products', async () => {
      expect(await productModel.countDocuments()).toBe(PRODUCT_COUNT);
    });

    it('creates each demo user exactly once', async () => {
      expect(await userModel.countDocuments()).toBe(2);
      const created = (results ?? []).reduce((sum, r) => sum + r.usersCreated, 0);
      expect(created).toBe(2);
    });
  });
});
