import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../../src/config/env.validation';
import { buildTestDbUri } from './test-db';

// Why this file exists: AppModule calls ConfigModule.forRoot({ isGlobal, validate })
// at import time and we must not change src/. By default that would read backend/.env
// (real Atlas URI). So we wrap forRoot BEFORE AppModule is imported:
// no .env file, no process.env, only the fake env below, still checked by validateEnv.
// create-test-app.ts imports this file first for exactly this reason.
export function buildTestEnv(): Record<string, string | number> {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    MONGODB_URI: buildTestDbUri(),
    JWT_SECRET: 'test-only-secret-0123456789-abcdefghij',
    JWT_EXPIRES_IN_SECONDS: 3600,
    CORS_ORIGIN: 'http://localhost:5173',
  };
}

const originalForRoot = ConfigModule.forRoot.bind(ConfigModule);

jest.spyOn(ConfigModule, 'forRoot').mockImplementation((options = {}) =>
  originalForRoot({
    ...options,
    ignoreEnvFile: true,
    ignoreEnvVars: true,
    validate: () => validateEnv(buildTestEnv()),
  }),
);
