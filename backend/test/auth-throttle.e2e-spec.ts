import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './helpers/create-test-app';
import { dropTestDb } from './helpers/test-db';

// Auth routes allow 5 requests per minute (AUTH_THROTTLE_LIMIT).
// Every test gets its own app, because the throttler keeps its counters in memory per app.
const LIMIT = 5;

describe('Auth rate limiting (e2e, real ThrottlerGuard)', () => {
  let app: INestApplication<App> | undefined;

  afterEach(async () => {
    if (app) {
      await dropTestDb(app);
      await app.close();
      app = undefined;
    }
  });

  const postLogin = (server: App) =>
    request(server)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' });

  const postRegister = (server: App, index: number) =>
    request(server)
      .post('/api/auth/register')
      .send({ email: `user${index}@example.com`, password: 'correct-horse-battery', name: 'User' });

  describe('with throttling enabled', () => {
    beforeEach(async () => {
      app = await createTestApp({ throttle: true });
    });

    it('processes 5 login attempts and returns 429 on the 6th', async () => {
      const server = app!.getHttpServer();

      for (let i = 0; i < LIMIT; i++) {
        await postLogin(server).expect(401);
      }
      await postLogin(server).expect(429);
    });

    it('processes 5 registrations and returns 429 on the 6th', async () => {
      const server = app!.getHttpServer();

      for (let i = 0; i < LIMIT; i++) {
        await postRegister(server, i).expect(201);
      }
      await postRegister(server, LIMIT).expect(429);
    });

    it('does not count login attempts against registration (separate counters)', async () => {
      const server = app!.getHttpServer();
      for (let i = 0; i < LIMIT; i++) {
        await postLogin(server).expect(401);
      }

      await postRegister(server, 0).expect(201);
    });

    it('does not limit GET /api/auth/me at 5 requests', async () => {
      const server = app!.getHttpServer();

      for (let i = 0; i < LIMIT + 1; i++) {
        await request(server).get('/api/auth/me').expect(401);
      }
    });

    it('does not limit GET /api/health at 5 requests', async () => {
      const server = app!.getHttpServer();

      for (let i = 0; i < LIMIT + 1; i++) {
        await request(server).get('/api/health').expect(200);
      }
    });
  });

  describe('with the default createTestApp()', () => {
    beforeEach(async () => {
      app = await createTestApp();
    });

    it('lets more than 5 login attempts through', async () => {
      const server = app!.getHttpServer();

      for (let i = 0; i < LIMIT + 2; i++) {
        await postLogin(server).expect(401);
      }
    });
  });
});
