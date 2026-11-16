import './helpers/test-config';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getOptionsToken, SkipThrottle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HealthController } from '../src/health/health.controller';

@Controller('limited')
class LimitedController {
  @Get()
  get(): { ok: boolean } {
    return { ok: true };
  }

  @SkipThrottle()
  @Get('free')
  free(): { ok: boolean } {
    return { ok: true };
  }
}

// Tiny app without AppModule and without a database: limit is 2 requests per minute
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
  controllers: [LimitedController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class TinyModule {}

async function createTinyApp(disableGuard: boolean): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({ imports: [TinyModule] });
  if (disableGuard) {
    // Same override as in test/helpers/create-test-app.ts
    builder
      .overrideProvider(getOptionsToken())
      .useValue([{ ttl: 60_000, limit: 1, skipIf: () => true }]);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('rate limiting (ThrottlerGuard)', () => {
  describe('with the guard enabled', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      app = await createTinyApp(false);
    });

    afterEach(async () => {
      await app.close();
    });

    it('allows two requests and returns 429 on the third', async () => {
      const server = app.getHttpServer();

      await request(server).get('/api/limited').expect(200);
      await request(server).get('/api/limited').expect(200);
      await request(server).get('/api/limited').expect(429);
    });

    it('keeps a @SkipThrottle() route available after the limit is used up', async () => {
      const server = app.getHttpServer();

      await request(server).get('/api/limited').expect(200);
      await request(server).get('/api/limited').expect(200);
      await request(server).get('/api/limited').expect(429);

      await request(server).get('/api/limited/free').expect(200);
      await request(server).get('/api/limited/free').expect(200);
      await request(server).get('/api/limited/free').expect(200);
    });
  });

  describe('with the guard overridden (as in createTestApp)', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      app = await createTinyApp(true);
    });

    afterEach(async () => {
      await app.close();
    });

    it('does not limit requests even beyond the configured limit', async () => {
      const server = app.getHttpServer();

      for (let i = 0; i < 5; i++) {
        await request(server).get('/api/limited').expect(200);
      }
    });
  });

  describe('production wiring', () => {
    it('registers ThrottlerGuard as a global APP_GUARD in AppModule', () => {
      const metadata: unknown = Reflect.getMetadata('providers', AppModule);
      const providers = Array.isArray(metadata) ? (metadata as unknown[]) : [];

      expect(providers).toContainEqual({ provide: APP_GUARD, useClass: ThrottlerGuard });
    });

    it('marks HealthController with @SkipThrottle()', () => {
      // The decorator stores THROTTLER:SKIP + throttler name ("default") on the class
      expect(Reflect.getMetadata('THROTTLER:SKIPdefault', HealthController)).toBe(true);
    });
  });
});
