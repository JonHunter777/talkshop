import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpServer,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Error as MongooseError } from 'mongoose';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface Reply {
  body: unknown;
  status: number;
}

// Minimal fakes of the HTTP adapter and of the host: the filter only calls reply()
function setup() {
  const replies: Reply[] = [];
  const adapter = {
    isHeadersSent: () => false,
    reply: (_response: unknown, body: unknown, status: number) => replies.push({ body, status }),
    end: jest.fn(),
  } as unknown as HttpServer;
  // BaseExceptionFilter reads the response object with host.getArgByIndex(1)
  const host = { getArgByIndex: () => ({}) } as unknown as ArgumentsHost;
  const filter = new AllExceptionsFilter(adapter);
  const run = (exception: unknown): Reply => {
    filter.catch(exception, host);
    const reply = replies.at(-1);
    if (!reply) {
      throw new Error('The filter did not reply');
    }
    return reply;
  };
  return { run };
}

describe('AllExceptionsFilter', () => {
  let errorLog: jest.SpyInstance;
  let warnLog: jest.SpyInstance;

  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HttpException', () => {
    it.each([
      ['NotFoundException', new NotFoundException('Product not found')],
      ['ConflictException', new ConflictException('Product with this slug already exists')],
      ['BadRequestException with a list', new BadRequestException(['a must be a string'])],
      ['ThrottlerException (429)', new ThrottlerException()],
      ['HttpException with a custom body', new HttpException({ status: 'error', db: 'down' }, 503)],
    ])('passes %s on unchanged', (_name, exception) => {
      const { run } = setup();

      const reply = run(exception);

      // "Unchanged" means the same as plain Nest: an object response is sent as is,
      // a string response is wrapped by Nest into { statusCode, message }
      const original = exception.getResponse();
      expect(reply.status).toBe(exception.getStatus());
      expect(reply.body).toEqual(
        typeof original === 'string'
          ? { statusCode: exception.getStatus(), message: original }
          : original,
      );
      expect(errorLog).not.toHaveBeenCalled();
    });
  });

  describe('Mongoose errors', () => {
    it('maps ValidationError to 400 with field names only (no values)', () => {
      const error = new MongooseError.ValidationError();
      error.addError(
        'priceCents',
        new MongooseError.ValidatorError({
          message: 'secret-value is bad',
          path: 'priceCents',
          value: 'secret-value',
        }),
      );
      error.addError(
        'name',
        new MongooseError.ValidatorError({ message: 'too short', path: 'name', value: 'x' }),
      );
      const { run } = setup();

      const reply = run(error);

      expect(reply.status).toBe(400);
      expect(reply.body).toMatchObject({
        statusCode: 400,
        message: 'Validation failed: priceCents, name',
      });
      expect(JSON.stringify(reply.body)).not.toContain('secret-value');
      expect(errorLog).not.toHaveBeenCalled();
      expect(warnLog).toHaveBeenCalled();
    });

    it('maps CastError to 400 with the path only (no value)', () => {
      const error = new MongooseError.CastError('ObjectId', 'secret-value', '_id');
      const { run } = setup();

      const reply = run(error);

      expect(reply.status).toBe(400);
      expect(reply.body).toMatchObject({ statusCode: 400, message: 'Invalid value for _id' });
      expect(JSON.stringify(reply.body)).not.toContain('secret-value');
    });
  });

  describe('E11000', () => {
    it('maps a duplicate key error to 409 without the key or the index name', () => {
      const error = Object.assign(new Error('E11000 duplicate key index: slug_1 dup key'), {
        code: 11000,
        keyValue: { slug: 'secret-slug' },
      });
      const { run } = setup();

      const reply = run(error);

      expect(reply.status).toBe(409);
      expect(reply.body).toMatchObject({ statusCode: 409, message: 'Duplicate value' });
      expect(JSON.stringify(reply.body)).not.toContain('secret-slug');
      expect(JSON.stringify(reply.body)).not.toContain('slug_1');
    });
  });

  describe('errors from the HTTP layer (http-errors)', () => {
    const httpError = (statusCode: number, message: string, expose?: boolean) =>
      Object.assign(new Error(message), {
        statusCode,
        ...(expose === undefined ? {} : { expose }),
      });

    it('keeps the status and message of a 4xx error that has expose: true', () => {
      const { run } = setup();

      const reply = run(httpError(413, 'request entity too large', true));

      expect(reply.status).toBe(413);
      expect(reply.body).toEqual({ statusCode: 413, message: 'request entity too large' });
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('sends only the standard status text when expose is false', () => {
      const { run } = setup();

      const reply = run(httpError(400, 'internal detail: /srv/app/secret.txt', false));

      expect(reply.status).toBe(400);
      expect(reply.body).toEqual({ statusCode: 400, message: 'Bad Request' });
    });

    // Allow-list: a foreign error shaped like http-errors but without `expose: true`
    // must not get its message to the client.
    it('sends only the standard status text when there is no expose field', () => {
      const { run } = setup();

      const reply = run(httpError(413, 'secret detail from some library'));

      expect(reply.status).toBe(413);
      expect(reply.body).toEqual({ statusCode: 413, message: 'Payload Too Large' });
      expect(JSON.stringify(reply.body)).not.toContain('secret');
    });

    it.each([
      [400, 400],
      [499, 499],
    ])('treats statusCode %i as a client error', (statusCode, expected) => {
      const { run } = setup();

      expect(run(httpError(statusCode, 'x', true)).status).toBe(expected);
    });

    describe('values that are NOT a 4xx http error become a generic 500 with a log', () => {
      it.each([
        ['statusCode 399', { statusCode: 399, message: 'x', expose: true }],
        ['statusCode 500', { statusCode: 500, message: 'x', expose: true }],
        ['a non-integer-like string statusCode', { statusCode: 'abc', message: 'x', expose: true }],
        ['a fractional statusCode', { statusCode: 450.5, message: 'x', expose: true }],
        ['a non-string message', { statusCode: 400, message: 123, expose: true }],
        ['an undefined message', { statusCode: 400, message: undefined, expose: true }],
      ])('%s', (_name, fields) => {
        const { run } = setup();

        const reply = run(Object.assign(new Error('real cause'), fields));

        expect(reply.status).toBe(500);
        expect(reply.body).toEqual({ statusCode: 500, message: 'Internal server error' });
        expect(errorLog).toHaveBeenCalledTimes(1);
      });
    });

    it('treats a 5xx http error as a server error: generic 500 and a log', () => {
      const { run } = setup();

      const reply = run(httpError(503, 'upstream down at 10.0.0.5'));

      expect(reply.status).toBe(500);
      expect(reply.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(errorLog).toHaveBeenCalledTimes(1);
    });
  });

  describe('unknown errors', () => {
    it('returns a generic 500 without the message or the stack, and logs the cause', () => {
      const error = new Error('connection to db-host with password hunter2 failed');
      const { run } = setup();

      const reply = run(error);

      expect(reply.status).toBe(500);
      expect(reply.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(JSON.stringify(reply.body)).not.toContain('hunter2');
      expect(JSON.stringify(reply.body)).not.toContain('stack');
      expect(errorLog).toHaveBeenCalledWith(error.message, error.stack);
    });

    it('handles a thrown non-Error value', () => {
      const { run } = setup();

      const reply = run('just a string');

      expect(reply.status).toBe(500);
      expect(reply.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(errorLog).toHaveBeenCalled();
    });
  });
});
