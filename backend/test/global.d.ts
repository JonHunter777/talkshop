import type { MongoMemoryReplSet } from 'mongodb-memory-server';

declare global {
  // Set in globalSetup.ts, read in globalTeardown.ts.
  var __MONGO_REPLSET__: MongoMemoryReplSet | undefined;
}

export {};
