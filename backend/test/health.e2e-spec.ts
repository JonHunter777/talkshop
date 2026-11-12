import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthModule } from './../src/health/health.module';
import { HealthService } from './../src/health/health.service';

// Real Atlas is never used in tests: HealthService is overridden.
describe('GET /api/health (e2e)', () => {
  let app: INestApplication<App>;
  const healthService = { isDbUp: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(HealthService)
      .useValue(healthService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 when DB is up', async () => {
    healthService.isDbUp.mockResolvedValue(true);
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', db: 'up' });
  });

  it('503 when DB is down', async () => {
    healthService.isDbUp.mockResolvedValue(false);
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(503)
      .expect({ status: 'error', db: 'down' });
  });
});
