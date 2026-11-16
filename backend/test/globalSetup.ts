import { MongoMemoryReplSet } from 'mongodb-memory-server';

// MongoDB 8.0 is the current Atlas major (dev/prod use it) and an 8.0.x binary exists
// for Windows. Override with MONGOMS_VERSION, e.g. MONGOMS_VERSION=7.0.14.
// Do not rely on the library default: it follows its own releases (8.2.x today).
const DEFAULT_MONGO_VERSION = '8.0.4';

// Runs once per `npm run test:e2e`. One single-node replica set for all test files:
// a replica set is required for transactions (checkout, order cancel in stage 1).
// First run downloads the mongod binary (~300 MB) into
// backend/node_modules/.cache/mongodb-memory-server; later runs reuse it.
// The download happens here, in globalSetup, which has no per-test timeout.
// On Windows the firewall may ask to allow mongod.exe: allow private networks.
export default async function globalSetup(): Promise<void> {
  const version = process.env.MONGOMS_VERSION ?? DEFAULT_MONGO_VERSION;
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: { version },
  });
  // Test files read the URI from env; teardown reaches the instance via globalThis
  // (globalSetup and globalTeardown run in the same process).
  process.env.MONGO_TEST_URI = replSet.getUri();
  globalThis.__MONGO_REPLSET__ = replSet;
}
