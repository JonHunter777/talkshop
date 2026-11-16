import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './helpers/create-test-app';
import { buildTestDbUri, dropTestDb, testDbName } from './helpers/test-db';

describe('e2e infrastructure', () => {
  let app: INestApplication<App>;
  let connection: Connection;

  beforeAll(async () => {
    app = await createTestApp();
    connection = app.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  it('GET /api/health pings the real in-memory database', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', db: 'up' });
  });

  it('connects to its own per-file database, not Atlas', () => {
    expect(connection.name).toBe(testDbName);
    expect(testDbName).toMatch(/^e2e_[0-9a-f]{12}$/);
  });

  it('supports transactions: commit keeps the document', async () => {
    await connection.createCollection('scratch_commit');
    const scratch = connection.collection('scratch_commit');
    const session = await connection.startSession();
    try {
      await session.withTransaction(async () => {
        await scratch.insertOne({ n: 1 }, { session });
      });
    } finally {
      await session.endSession();
    }
    expect(await scratch.countDocuments()).toBe(1);
  });

  it('supports transactions: an error rolls the insert back', async () => {
    await connection.createCollection('scratch_abort');
    const scratch = connection.collection('scratch_abort');
    const session = await connection.startSession();
    try {
      await expect(
        session.withTransaction(async () => {
          await scratch.insertOne({ n: 1 }, { session });
          throw new Error('abort on purpose');
        }),
      ).rejects.toThrow('abort on purpose');
    } finally {
      await session.endSession();
    }
    expect(await scratch.countDocuments()).toBe(0);
  });

  it('builds different URIs for different database names on the same server', () => {
    const base = 'mongodb://127.0.0.1:27017/?replicaSet=rs0';
    expect(buildTestDbUri(base, 'e2e_a')).not.toBe(buildTestDbUri(base, 'e2e_b'));
    expect(buildTestDbUri(base, 'e2e_a')).toContain('/e2e_a?');
  });

  it('dropTestDb removes the data of this file', async () => {
    await connection.collection('to_be_dropped').insertOne({ x: 1 });
    await dropTestDb(app);
    expect(await connection.collection('to_be_dropped').countDocuments()).toBe(0);
  });
});
