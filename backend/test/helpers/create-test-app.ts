// Order matters: test-config must run before AppModule is imported (see its comment).
import './test-config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { syncAllIndexes } from './test-db';

// Builds the app like src/main.ts does (prefix, ValidationPipe) on the in-memory DB.
// CORS and Swagger are not needed for API tests.
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    // Stage 1, step 2: when ThrottlerGuard is registered globally, disable it here, e.g.
    // .overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true })
    // (or raise the limits for a dedicated rate-limit test).
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
