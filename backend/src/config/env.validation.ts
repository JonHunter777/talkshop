import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { CorsOriginsError, parseCorsOrigins } from './cors-origins';

export class EnvironmentVariables {
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsString()
  @IsNotEmpty()
  MONGODB_URI!: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN: string = 'http://localhost:5173';

  // Signing key for JWT. Shorter keys are easy to brute-force.
  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  // Token lifetime in seconds: 1 minute .. 7 days (default 1 hour)
  @IsInt()
  @Min(60)
  @Max(604800)
  JWT_EXPIRES_IN_SECONDS: number = 3600;
}

// Fails fast at startup. The error text lists only variable names and rules,
// never values, because MONGODB_URI and JWT_SECRET are secrets.
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const instance = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(instance);
  const details = errors.map(
    (e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
  );
  // Simpler than a custom decorator: the rules need NODE_ENV, so we check after validateSync.
  // Only when both fields are valid, otherwise the error is already reported above.
  const failed = new Set(errors.map((e) => e.property));
  if (!failed.has('CORS_ORIGIN') && !failed.has('NODE_ENV')) {
    try {
      parseCorsOrigins(instance.CORS_ORIGIN, instance.NODE_ENV);
    } catch (error) {
      if (!(error instanceof CorsOriginsError)) throw error;
      details.push(`CORS_ORIGIN: ${error.message}`);
    }
  }
  if (details.length > 0) {
    throw new Error(`Invalid environment variables -> ${details.join('; ')}`);
  }
  return instance;
}
