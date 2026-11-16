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
  if (errors.length > 0) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment variables -> ${details}`);
  }
  return instance;
}
