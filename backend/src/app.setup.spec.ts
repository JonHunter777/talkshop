import type { Server } from 'node:http';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import { buildCorsOptions, buildHelmetOptions } from './app.setup';

// Minimal controller: one route, so we can look at real response headers.
@Controller()
class PingController {
  @Get('ping')
  ping(): { ok: boolean } {
    return { ok: true };
  }
}

// getHttpServer() is typed as `any` in Nest; give it a real type once, here.
const serverOf = (app: INestApplication): Server => app.getHttpServer() as Server;

const createPingApp = async (
  configure: (app: INestApplication) => void,
): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    controllers: [PingController],
  }).compile();
  const app = moduleRef.createNestApplication();
  configure(app);
  await app.init();
  return app;
};

describe('buildHelmetOptions', () => {
  it('keeps helmet defaults (CSP enabled) in production', () => {
    const options = buildHelmetOptions('production');

    expect(options.contentSecurityPolicy).not.toBe(false);
    expect(options).toEqual({});
  });

  it.each(['test', 'development'])(
    'disables only the CSP in %s (Swagger UI needs inline scripts)',
    (nodeEnv) => {
      const options = buildHelmetOptions(nodeEnv);

      expect(options.contentSecurityPolicy).toBe(false);
      expect(Object.keys(options)).toEqual(['contentSecurityPolicy']);
    },
  );

  describe('real response headers in a mini Nest app', () => {
    let app: INestApplication | undefined;

    const makeApp = async (nodeEnv: string): Promise<INestApplication> => {
      app = await createPingApp((nestApp) => {
        nestApp.use(helmet(buildHelmetOptions(nodeEnv)));
      });
      return app;
    };

    afterEach(async () => {
      await app?.close();
      app = undefined;
    });

    it('production sends content-security-policy and strict-transport-security', async () => {
      const nestApp = await makeApp('production');

      const res = await request(serverOf(nestApp)).get('/ping');

      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
    });

    it.each(['test', 'development'])('%s does not send content-security-policy', async (env) => {
      const nestApp = await makeApp(env);

      const res = await request(serverOf(nestApp)).get('/ping');

      expect(res.headers['content-security-policy']).toBeUndefined();
    });

    it.each(['test', 'development'])(
      '%s still sends the other helmet headers and hides x-powered-by',
      async (env) => {
        const nestApp = await makeApp(env);

        const res = await request(serverOf(nestApp)).get('/ping');

        expect(res.headers['strict-transport-security']).toBeDefined();
        expect(res.headers['x-frame-options']).toBeDefined();
        expect(res.headers['referrer-policy']).toBeDefined();
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-powered-by']).toBeUndefined();
      },
    );
  });
});

describe('buildCorsOptions', () => {
  const ORIGIN_A = 'https://a.example.invalid';
  const ORIGIN_B = 'https://b.example.invalid';
  const EVIL = 'https://evil.example.invalid';

  let app: INestApplication;

  beforeEach(async () => {
    app = await createPingApp((nestApp) => {
      nestApp.enableCors(buildCorsOptions([ORIGIN_A, ORIGIN_B]));
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([ORIGIN_A, ORIGIN_B])('echoes the allowed origin %s', async (origin) => {
    const res = await request(serverOf(app)).get('/ping').set('Origin', origin);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('adds Origin to the vary header for an allowed origin', async () => {
    const res = await request(serverOf(app)).get('/ping').set('Origin', ORIGIN_A);

    expect(res.headers['vary']).toMatch(/Origin/i);
  });

  it('does not allow a foreign origin', async () => {
    const res = await request(serverOf(app)).get('/ping').set('Origin', EVIL);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers 200 without allow-origin when the request has no Origin', async () => {
    const res = await request(serverOf(app)).get('/ping');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not list a forbidden request header in the preflight answer', async () => {
    const res = await request(serverOf(app))
      .options('/ping')
      .set('Origin', ORIGIN_A)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'X-Custom');

    const allowed = String(res.headers['access-control-allow-headers'] ?? '').toLowerCase();
    expect(allowed).not.toContain('x-custom');
  });

  it('does not send allow-credentials', async () => {
    const res = await request(serverOf(app)).get('/ping').set('Origin', ORIGIN_A);

    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
