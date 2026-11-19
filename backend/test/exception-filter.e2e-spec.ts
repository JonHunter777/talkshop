import { ConflictException, Controller, Get, INestApplication, Logger } from '@nestjs/common';
import { Error as MongooseError } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './helpers/create-test-app';
import { dropTestDb } from './helpers/test-db';

// Test-only routes that throw different errors, to check the global filter through real HTTP
@Controller('test-errors')
class TestErrorsController {
  @Get('http')
  http(): never {
    throw new ConflictException('Already exists');
  }

  @Get('validation')
  validation(): never {
    const error = new MongooseError.ValidationError();
    error.addError(
      'name',
      new MongooseError.ValidatorError({
        message: 'bad secret-value',
        path: 'name',
        value: 'secret-value',
      }),
    );
    throw error;
  }

  @Get('cast')
  cast(): never {
    throw new MongooseError.CastError('ObjectId', 'secret-value', '_id');
  }

  @Get('duplicate')
  duplicate(): never {
    throw Object.assign(new Error('E11000 duplicate key index: slug_1'), {
      code: 11000,
      keyValue: { slug: 'secret-slug' },
    });
  }

  @Get('unknown')
  unknown(): never {
    throw new Error('db password hunter2 leaked');
  }
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

describe('Global exception filter (e2e)', () => {
  let app: INestApplication<App>;
  let errorLog: jest.SpyInstance;

  beforeAll(async () => {
    app = await createTestApp({ extraControllers: [TestErrorsController] });
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const get = async (path: string) => {
    const res = await request(app.getHttpServer()).get(`/api/test-errors/${path}`);
    return { status: res.status, body: res.body as ErrorBody, text: res.text };
  };

  it('keeps the standard Nest body of an HttpException', async () => {
    const { status, body } = await get('http');

    expect(status).toBe(409);
    expect(body).toEqual({ statusCode: 409, message: 'Already exists', error: 'Conflict' });
  });

  it('maps a Mongoose ValidationError to 400 without the value', async () => {
    const { status, body, text } = await get('validation');

    expect(status).toBe(400);
    expect(body.message).toBe('Validation failed: name');
    expect(text).not.toContain('secret-value');
  });

  it('maps a Mongoose CastError to 400 without the value', async () => {
    const { status, body, text } = await get('cast');

    expect(status).toBe(400);
    expect(body.message).toBe('Invalid value for _id');
    expect(text).not.toContain('secret-value');
  });

  it('maps E11000 to 409 without key details', async () => {
    const { status, body, text } = await get('duplicate');

    expect(status).toBe(409);
    expect(body.message).toBe('Duplicate value');
    expect(text).not.toContain('secret-slug');
    expect(text).not.toContain('slug_1');
  });

  it('returns a clean 500 for an unknown error and logs the cause on the server', async () => {
    const { status, body, text } = await get('unknown');

    expect(status).toBe(500);
    expect(body).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('at ');
    expect(errorLog).toHaveBeenCalledWith('db password hunter2 leaked', expect.any(String));
  });

  it('logs an unknown error exactly once (no second log from the base filter)', async () => {
    await get('unknown');

    // Nest's BaseExceptionFilter logs unknown errors itself, through a static logger that shares
    // Logger.prototype. Our filter turns every error into an HttpException before calling it,
    // so that branch is never reached and only our own log line remains.
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  describe('errors from the HTTP layer (http-errors, body-parser)', () => {
    it('returns 400 for a malformed JSON body, not 500', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": ');

      expect(res.status).toBe(400);
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('returns 413 for a body that is too large, not 500', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: 'a'.repeat(300_000) }));

      expect(res.status).toBe(413);
      expect(errorLog).not.toHaveBeenCalled();
    });
  });

  it('returns 404 for an unknown route (Nest NotFoundException is not changed)', async () => {
    const res = await request(app.getHttpServer()).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404 });
  });
});
