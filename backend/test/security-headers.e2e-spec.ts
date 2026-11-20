import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './helpers/create-test-app';
import { buildTestEnv } from './helpers/test-config';
import { dropTestDb } from './helpers/test-db';

// The allowed origin comes from the shared test env, so the test follows it automatically.
const ALLOWED_ORIGIN = String(buildTestEnv().CORS_ORIGIN);
const EVIL_ORIGIN = 'https://evil.example.invalid';

describe('Security headers and CORS (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const preflight = (origin: string, method: string, headers = 'authorization') =>
    http()
      .options('/api/orders')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', method)
      .set('Access-Control-Request-Headers', headers);

  describe('simple requests', () => {
    it('allows the configured origin', async () => {
      const res = await http().get('/api/health').set('Origin', ALLOWED_ORIGIN);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    it('does not send allow-credentials (tokens go in the Authorization header)', async () => {
      const res = await http().get('/api/health').set('Origin', ALLOWED_ORIGIN);

      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('answers 200 without allow-origin when there is no Origin header', async () => {
      const res = await http().get('/api/health');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('does not allow a foreign origin', async () => {
      const res = await http().get('/api/health').set('Origin', EVIL_ORIGIN);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('preflight OPTIONS /api/orders', () => {
    it('answers 204 for the allowed origin', async () => {
      const res = await preflight(ALLOWED_ORIGIN, 'PATCH');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    it('allows the Authorization header', async () => {
      const res = await preflight(ALLOWED_ORIGIN, 'PATCH');

      expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain('authorization');
    });

    it('lists exactly GET, POST, PATCH, DELETE in allowed methods', async () => {
      const res = await preflight(ALLOWED_ORIGIN, 'PATCH');

      const methods = String(res.headers['access-control-allow-methods']).split(',');
      expect(methods.map((m) => m.trim())).toEqual(['GET', 'POST', 'PATCH', 'DELETE']);
    });

    it('does not allow a custom request header', async () => {
      const res = await preflight(ALLOWED_ORIGIN, 'PATCH', 'x-custom');

      const allowed = String(res.headers['access-control-allow-headers'] ?? '').toLowerCase();
      expect(allowed).not.toContain('x-custom');
    });

    it('adds Origin to the vary header', async () => {
      const res = await preflight(ALLOWED_ORIGIN, 'PATCH');

      expect(res.headers['vary']).toMatch(/Origin/i);
    });

    it('does not send allow-credentials', async () => {
      const res = await preflight(ALLOWED_ORIGIN, 'PATCH');

      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('lets browsers cache the preflight for 600 seconds', async () => {
      const res = await preflight(ALLOWED_ORIGIN, 'PATCH');

      expect(res.headers['access-control-max-age']).toBe('600');
    });

    it.each(['GET', 'POST', 'PATCH', 'DELETE'])(
      'answers 2xx when the requested method is %s',
      async (method) => {
        const res = await preflight(ALLOWED_ORIGIN, method);

        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
        expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      },
    );

    it('does not allow a foreign origin', async () => {
      const res = await preflight(EVIL_ORIGIN, 'PATCH');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('does not list PUT in allowed methods', async () => {
      const res = await preflight(ALLOWED_ORIGIN, 'PUT');

      const methods = (res.headers['access-control-allow-methods'] as string | undefined) ?? '';
      expect(methods.split(',').map((m) => m.trim())).not.toContain('PUT');
    });
  });

  describe('helmet headers', () => {
    it('does not send CSP in the test environment (it is on only in production)', async () => {
      const res = await http().get('/api/health');

      expect(res.headers['content-security-policy']).toBeUndefined();
    });

    it('sends strict-transport-security, x-frame-options and referrer-policy', async () => {
      const res = await http().get('/api/health');

      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['referrer-policy']).toBeDefined();
    });

    it('sets nosniff and hides x-powered-by on a successful response', async () => {
      const res = await http().get('/api/health');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('sets nosniff and hides x-powered-by on a 404 response', async () => {
      const res = await http().get('/api/no-such-route');

      expect(res.status).toBe(404);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('sets nosniff and hides x-powered-by on a 401 response', async () => {
      const res = await http().get('/api/orders');

      expect(res.status).toBe(401);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });
});
