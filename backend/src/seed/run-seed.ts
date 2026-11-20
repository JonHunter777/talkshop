import * as bcrypt from 'bcryptjs';
import type { AnyBulkWriteOperation, Connection, Model, Schema } from 'mongoose';
import { BCRYPT_ROUNDS } from '../common/constants/auth';
import type { Role } from '../common/constants/roles';
import { isDuplicateKeyError } from '../common/utils/mongo-errors';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import type { SeedAccount, SeedConfig } from './seed-guard';

// Shape of one item in seed/data/products.json (the fields the seed owns).
export type SeedProduct = Pick<
  Product,
  'name' | 'slug' | 'description' | 'category' | 'priceCents' | 'stock' | 'images' | 'attributes'
>;

export interface SeedResult {
  productsCreated: number;
  productsUpdated: number;
  usersCreated: number;
  usersSkipped: number;
  // Which demo accounts already exist with an unexpected role (never changed by the seed)
  roleMismatch: Array<'admin' | 'user'>;
}

// Thrown for broken seed data. The message has only the slug/index and field names,
// never field values, so it is safe to print.
export class SeedDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedDataError';
  }
}

const ADMIN_NAME = 'Admin';
const CUSTOMER_NAME = 'Demo Customer';

// A slug is printed only if it looks like a plain slug; otherwise we print the position.
function describeItem(item: Partial<SeedProduct>, index: number): string {
  const slug = item.slug;
  return typeof slug === 'string' && /^[a-z0-9-]{1,120}$/.test(slug)
    ? `slug "${slug}"`
    : `item #${index}`;
}

// connection.model() calls Model.init() right away, which would create the collection and
// all indexes in the background, before our data validation. Mongoose reads autoIndex /
// autoCreate in this order: schema options -> connection options -> global options, so we
// set them on a COPY of the schema (the shared app schema stays untouched). This protects
// the seed no matter how the connection was created. Explicit createIndexes() still works:
// the autoIndex check in mongoose applies only to automatic (init) index builds.
// If the connection already has this model, it is reused as is (we cannot change it).
function createSeedModel<T>(connection: Connection, name: string, schema: Schema<T>): Model<T> {
  const existing = connection.models[name] as Model<T> | undefined;
  if (existing) {
    return existing;
  }
  const seedSchema = schema.clone<Schema<T>>();
  seedSchema.set('autoIndex', false);
  seedSchema.set('autoCreate', false);
  return connection.model<T>(name, seedSchema);
}

// Pure function: no env, no files, no logging. The caller must run the guard first.
// Writes only with upsert / $setOnInsert: it never deletes and never overwrites users.
export async function runSeed(
  connection: Connection,
  products: SeedProduct[],
  config: SeedConfig,
): Promise<SeedResult> {
  const ProductModel = createSeedModel(connection, Product.name, ProductSchema);
  const UserModel = createSeedModel(connection, User.name, UserSchema);

  // (a) Validate everything BEFORE the first write: a bad item changes nothing in the DB.
  // We use the validated (cast, trimmed, lowercased) document values for writing.
  const seen = new Set<string>();
  const prepared: SeedProduct[] = [];
  for (const [index, item] of products.entries()) {
    const doc = new ProductModel(item);
    try {
      await doc.validate();
    } catch (error) {
      const fields =
        error instanceof Error && 'errors' in error && typeof error.errors === 'object'
          ? Object.keys(error.errors ?? {}).join(', ')
          : 'unknown';
      throw new SeedDataError(`Invalid product (${describeItem(item, index)}), fields: ${fields}`);
    }
    if (seen.has(doc.slug)) {
      throw new SeedDataError(`Duplicate product (${describeItem(item, index)}): field slug`);
    }
    seen.add(doc.slug);
    prepared.push({
      name: doc.name,
      slug: doc.slug,
      description: doc.description,
      category: doc.category,
      priceCents: doc.priceCents,
      stock: doc.stock,
      images: doc.images,
      attributes: { ...doc.attributes },
    });
  }

  // (b) Create indexes only (idempotent). No syncIndexes, no drop. A failure stops the seed
  // before any data is written (e.g. the unique slug/email index cannot be built).
  await ProductModel.createIndexes();
  await UserModel.createIndexes();

  // (c) Products: upsert by slug. Content is refreshed on every run, `stock` is written
  // only on insert so that real stock changes are not reset by a re-run.
  const operations: AnyBulkWriteOperation<Product>[] = prepared.map((p) => ({
    updateOne: {
      filter: { slug: p.slug },
      update: {
        $set: {
          name: p.name,
          description: p.description,
          category: p.category,
          priceCents: p.priceCents,
          images: p.images,
          attributes: p.attributes,
        },
        $setOnInsert: { slug: p.slug, stock: p.stock },
      },
      upsert: true,
    },
  }));

  // Mongoose applies schema timestamps to bulkWrite updateOne (checked in castBulkWrite):
  // `updatedAt` goes to $set, `createdAt` to $setOnInsert, so createdAt appears on insert only.
  // Because of that, `updatedAt` changes on every run, even if the content is identical.
  // So "updated" means "existing and rewritten", not "really different".
  const bulk = await ProductModel.bulkWrite(operations, { ordered: false });

  // (d) Users: never overwritten. Existing user -> skip, no hashing.
  let usersCreated = 0;
  let usersSkipped = 0;
  const roleMismatch: Array<'admin' | 'user'> = [];

  const accounts: Array<{
    key: 'admin' | 'user';
    account: SeedAccount;
    name: string;
    role: Role;
  }> = [
    { key: 'admin', account: config.admin, name: ADMIN_NAME, role: 'admin' },
    { key: 'user', account: config.user, name: CUSTOMER_NAME, role: 'customer' },
  ];

  for (const { key, account, name, role } of accounts) {
    // `role` is the only extra field read; passwordHash is select:false and not loaded
    const existing = await UserModel.findOne({ email: account.email }, { role: 1 }).lean();
    if (existing) {
      usersSkipped++;
      if (existing.role !== role) {
        roleMismatch.push(key);
      }
      continue;
    }

    const passwordHash = await bcrypt.hash(account.password, BCRYPT_ROUNDS);
    try {
      const res = await UserModel.updateOne(
        { email: account.email },
        { $setOnInsert: { email: account.email, passwordHash, name, role } },
        { upsert: true },
      );
      if (res.upsertedCount > 0) {
        usersCreated++;
      } else {
        usersSkipped++;
      }
    } catch (error) {
      // Parallel seed run created the user between our check and the upsert
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      usersSkipped++;
    }
  }

  return {
    productsCreated: bulk.upsertedCount,
    productsUpdated: bulk.matchedCount,
    usersCreated,
    usersSkipped,
    roleMismatch,
  };
}
