import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { E2E_DB_NAME_PATTERN, LOCAL_DB_HOSTS } from '../../src/seed/seed-targets';

function getBaseUri(): string {
  const uri = process.env.MONGO_TEST_URI;
  if (!uri) {
    throw new Error('MONGO_TEST_URI is not set: run e2e tests with `npm run test:e2e`');
  }
  return uri;
}

// Every test file gets its own database, so files can run in parallel
// and never see each other's data. This module is loaded once per test file.
export const testDbName = `e2e_${randomBytes(6).toString('hex')}`;

// getUri() looks like mongodb://127.0.0.1:PORT/?replicaSet=rs0 -> put the db name into the path.
export function buildTestDbUri(
  baseUri: string = getBaseUri(),
  dbName: string = testDbName,
): string {
  const url = new URL(baseUri);
  url.pathname = `/${dbName}`;
  return url.toString();
}

// Creates indexes declared in schemas (unique email, text index, ...) before tests,
// so tests see the same constraints as production.
export async function syncAllIndexes(app: INestApplication): Promise<void> {
  const connection = app.get<Connection>(getConnectionToken());
  for (const model of Object.values(connection.models)) {
    await model.syncIndexes();
  }
}

// Guard against dropping a real database (e.g. Atlas) by mistake.
// Only the name and host are put into the message: never the connection string or credentials.
export function assertSafeTestDb(name: string, host: string | undefined): void {
  if (!E2E_DB_NAME_PATTERN.test(name)) {
    throw new Error(`Refusing to drop database "${name}": name must match ${E2E_DB_NAME_PATTERN}`);
  }
  if (host === undefined || !LOCAL_DB_HOSTS.includes(host)) {
    throw new Error(
      `Refusing to drop database "${name}": host "${String(host)}" is not ${LOCAL_DB_HOSTS.join(' or ')}`,
    );
  }
}

// The part of mongoose Connection that we need (easy to fake in tests).
export interface DroppableConnection {
  name: string;
  host?: string;
  dropDatabase(): Promise<unknown>;
  getClient?(): { options: { hosts?: { host?: string }[] } };
}

function getHost(connection: DroppableConnection): string | undefined {
  return connection.host || connection.getClient?.().options.hosts?.[0]?.host;
}

export async function dropTestDbConnection(connection: DroppableConnection): Promise<void> {
  assertSafeTestDb(connection.name, getHost(connection));
  await connection.dropDatabase();
}

// Call in afterAll: drops this file's database (only if it is a local e2e_ database).
export async function dropTestDb(app: INestApplication): Promise<void> {
  await dropTestDbConnection(app.get<Connection>(getConnectionToken()));
}
