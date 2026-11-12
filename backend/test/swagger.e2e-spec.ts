import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthModule } from './../src/health/health.module';
import { HealthService } from './../src/health/health.service';
import { setupSwagger } from './../src/swagger.setup';

// Real Atlas is never used in tests: HealthService is overridden.
async function createApp(
  swaggerEnabled: boolean,
): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [HealthModule] })
    .overrideProvider(HealthService)
    .useValue({ isDbUp: jest.fn() })
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api');
  setupSwagger(app, swaggerEnabled);
  await app.init();
  return app;
}

describe('Swagger docs (e2e)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app.close();
  });

  it('serves /api/docs and /api/docs-json when enabled', async () => {
    app = await createApp(true);
    await request(app.getHttpServer())
      .get('/api/docs')
      .expect(200)
      .expect('Content-Type', /html/);
    const res = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const body = res.body as { paths: Record<string, unknown> };
    expect(Object.keys(body.paths)).toContain('/api/health');
  });

  it('returns 404 for docs when disabled (production)', async () => {
    app = await createApp(false);
    await request(app.getHttpServer()).get('/api/docs').expect(404);
    await request(app.getHttpServer()).get('/api/docs-json').expect(404);
  });
});
