import { Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { loadSeedEnv } from './load-env';
import { runSeed, SeedDataError, type SeedProduct } from './run-seed';
import { assertSafeSeedTarget, SeedGuardError } from './seed-guard';

// Read and parse products.json. Parser/fs messages can contain file content or paths,
// so we replace them with our own fixed messages.
function readProducts(): SeedProduct[] {
  let raw: string;
  try {
    raw = readFileSync(join(__dirname, 'data', 'products.json'), 'utf8');
  } catch {
    throw new SeedDataError('products.json cannot be read');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SeedDataError('products.json is not valid JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new SeedDataError('products.json must contain an array');
  }
  return parsed as SeedProduct[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Builds a log line for an unexpected error from whitelisted fields only.
// Never uses message, stack, URI or host: driver messages may contain them.
function describeUnexpectedError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Seed failed: unknown error';
  }

  const parts: string[] = [`Seed failed: ${error.name}`];
  const { code, codeName } = error as { code?: unknown; codeName?: unknown };

  if (isFiniteNumber(code) || (typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code))) {
    parts.push(`code=${code}`);
  }
  if (typeof codeName === 'string' && /^[A-Za-z0-9]{1,60}$/.test(codeName)) {
    parts.push(`codeName=${codeName}`);
  }

  // MongoBulkWriteError keeps the counters of a partly done bulk write in `result`
  if (error instanceof mongoose.mongo.MongoBulkWriteError || error.name === 'MongoBulkWriteError') {
    const result = (error as { result?: unknown }).result;
    if (typeof result === 'object' && result !== null) {
      const counters = result as Record<string, unknown>;
      for (const key of ['insertedCount', 'upsertedCount', 'matchedCount', 'modifiedCount']) {
        const value = counters[key];
        if (isFiniteNumber(value)) {
          parts.push(`${key}=${value}`);
        }
      }
    }
  }

  return parts.join(', ');
}

// CLI entry point: the only seed file with side effects (env, disk, network, logging).
// Order matters: env -> guard (before ANY connection) -> data -> connect -> seed.
async function main(): Promise<void> {
  const logger = new Logger('Seed');
  let connection: mongoose.Connection | undefined;

  try {
    loadSeedEnv();
    const config = assertSafeSeedTarget(process.env);

    const products = readProducts();

    // The guard already checked MONGODB_URI, so it is a safe string here.
    // autoIndex/autoCreate off: connecting must not create anything; runSeed builds
    // indexes explicitly, and only after the data is validated.
    connection = await mongoose
      .createConnection(process.env.MONGODB_URI as string, {
        autoIndex: false,
        autoCreate: false,
        serverSelectionTimeoutMS: 10000,
      })
      .asPromise();
    // The database name was validated by the guard, so it is safe to print
    logger.log(`Seeding database "${connection.name}" (${products.length} products)`);
    logger.warn(
      'Existing products are matched by slug: their content (name, description, category, ' +
        'priceCents, images, attributes) will be overwritten, stock is kept. ' +
        'Existing users are not changed.',
    );

    const result = await runSeed(connection, products, config);

    logger.log(
      `Products: ${result.productsCreated} created, ${result.productsUpdated} updated (existing, content rewritten)`,
    );
    logger.log(`Users: ${result.usersCreated} created, ${result.usersSkipped} skipped`);
    if (result.roleMismatch.length > 0) {
      logger.warn(
        `Existing demo account(s) with an unexpected role, left unchanged: ${result.roleMismatch.join(', ')}`,
      );
    }
  } catch (error) {
    // Only our own errors have safe messages. Driver/network messages may contain a host or URI.
    if (error instanceof SeedGuardError || error instanceof SeedDataError) {
      logger.error(`${error.name}: ${error.message}`);
    } else {
      logger.error(describeUnexpectedError(error));
    }
    process.exitCode = 1;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        // Must not hide the main exit code or cause an unhandled rejection; class name only
        logger.error(
          `Closing the connection failed: ${closeError instanceof Error ? closeError.name : 'unknown error'}`,
        );
      }
    }
  }
}

void main();
