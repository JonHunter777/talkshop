// Order matters: test-config must run before AppModule is imported (see its comment).
import './test-config';
import { INestApplication, Type, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { syncAllIndexes } from './test-db';

export interface CreateTestAppOptions {
  // true: keep the real rate limiting (429). Default false: the limit is switched off.
  throttle?: boolean;
  // Extra controllers added next to AppModule (e.g. a test-only protected route)
  extraControllers?: Type<unknown>[];
  // Lets a test replace providers before the app is built (e.g. builder.overrideProvider(...))
  configure?: (builder: TestingModuleBuilder) => void;
}

// Builds the app like src/main.ts does (prefix, ValidationPipe) on the in-memory DB.
// CORS and Swagger are not needed for API tests.
export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.extraControllers ?? [],
  });
  if (!options.throttle) {
    // The global ThrottlerGuard (APP_GUARD) cannot be replaced with overrideGuard, so we
    // override its options: skipIf makes it let every request through (no 429 in API tests).
    // Rate limiting is tested with `throttle: true` (see test/auth-throttle.e2e-spec.ts).
    builder
      .overrideProvider(getOptionsToken())
      .useValue([{ ttl: 60_000, limit: 1, skipIf: () => true }]);
  }
  options.configure?.(builder);
  const moduleRef = await builder.compile();

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
