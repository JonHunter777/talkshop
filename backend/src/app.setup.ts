import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';
import helmet, { HelmetOptions } from 'helmet';
import { parseCorsOrigins } from './config/cors-origins';

// Production: helmet defaults (CSP on). Outside production only CSP is off,
// because Swagger UI uses inline scripts that the default CSP blocks.
export function buildHelmetOptions(nodeEnv: string): HelmetOptions {
  return nodeEnv === 'production' ? {} : { contentSecurityPolicy: false };
}

// Pure function: can be passed to app.enableCors() and to the `cors` package on plain Express.
export function buildCorsOptions(origins: string[]): CorsOptions {
  return {
    origin: origins,
    // The token goes in the Authorization header, cookies are not used
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'], // the cors middleware answers OPTIONS itself
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600, // browsers may cache the preflight for 10 minutes
  };
}

// Shared by main.ts and the e2e test app, so tests run with the same setup.
// Swagger is not here: it is set up separately in main.ts.
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const nodeEnv = config.getOrThrow<string>('NODE_ENV');

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Registered before routes are added (app.init / listen), so it covers all of them
  app.use(helmet(buildHelmetOptions(nodeEnv)));
  const origins = parseCorsOrigins(config.getOrThrow<string>('CORS_ORIGIN'), nodeEnv);
  app.enableCors(buildCorsOptions(origins));
}
