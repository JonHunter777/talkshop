// Order matters: test-config must run before AppModule is imported (see its comment).
import './test-config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { syncAllIndexes } from './test-db';

// Builds the app like src/main.ts does (prefix, ValidationPipe) on the in-memory DB.
// CORS and Swagger are not needed for API tests.
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    // The global ThrottlerGuard (APP_GUARD) cannot be replaced with overrideGuard, so we
    // override its options: skipIf makes it let every request through (no 429 in API tests).
    // Rate limiting is tested separately in test/throttler.e2e-spec.ts.
    .overrideProvider(getOptionsToken())
    .useValue([{ ttl: 60_000, limit: 1, skipIf: () => true }])
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  await syncAllIndexes(app);
  return app;
}
