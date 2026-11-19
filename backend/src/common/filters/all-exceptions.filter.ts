import { STATUS_CODES } from 'node:http';
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Error as MongooseError } from 'mongoose';
import { isDuplicateKeyError } from '../utils/mongo-errors';

// Global safety net (registered with APP_FILTER in AppModule, so e2e tests see it too).
//
// - HttpException (400, 401, 403, 404, 409, 429 ...): passed on UNCHANGED.
// - Mongoose ValidationError / CastError: the client sent something the DB layer rejects -> 400.
// - E11000 (unique index): 409.
// - 4xx errors of the HTTP layer (http-errors: too large body, bad content type): status kept.
// - Anything else: 500 with a generic text. The real cause and the stack go to the server log
//   only, never to the client.
//
// Responses for mapped errors never contain the offending value or the index details:
// only field names / paths.
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  override catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(this.toHttpException(exception), host);
  }

  private toHttpException(exception: unknown): HttpException {
    if (exception instanceof HttpException) {
      return exception;
    }

    if (exception instanceof MongooseError.ValidationError) {
      this.logger.warn(`Mongoose validation failed: ${exception.message}`);
      return new BadRequestException(
        `Validation failed: ${Object.keys(exception.errors).join(', ')}`,
      );
    }

    if (exception instanceof MongooseError.CastError) {
      this.logger.warn(`Mongoose cast failed: ${exception.message}`);
      return new BadRequestException(`Invalid value for ${exception.path}`);
    }

    if (isDuplicateKeyError(exception)) {
      this.logger.warn('Duplicate key error (E11000)');
      return new ConflictException('Duplicate value');
    }

    // Client errors from the HTTP layer (the "http-errors" library used by body-parser):
    // 413 payload too large, 415 unsupported media type, 400 bad JSON ... Keep their status,
    // as plain Nest does. 5xx stays below: those are real server errors and get a generic 500.
    const clientError = this.asHttpClientError(exception);
    if (clientError) {
      return clientError;
    }

    if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error(`Non-error value was thrown: ${String(exception)}`);
    }
    // Same body Nest sends for unhandled errors: {statusCode, message}, no extra fields
    return new HttpException(
      { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  // "http-errors" errors carry `statusCode`, `message` and `expose` (true for 4xx: the message
  // may reach the client). Without `expose: true` only the standard text of the status is sent.
  private asHttpClientError(exception: unknown): HttpException | null {
    if (typeof exception !== 'object' || exception === null) {
      return null;
    }
    const { statusCode, message, expose } = exception as {
      statusCode?: unknown;
      message?: unknown;
      expose?: unknown;
    };
    if (
      typeof statusCode !== 'number' ||
      !Number.isInteger(statusCode) ||
      statusCode < 400 ||
      statusCode > 499 ||
      typeof message !== 'string'
    ) {
      return null;
    }
    // Allow-list: the message is sent only if the error explicitly says it is safe to show
    // (`expose === true`). Anything else gets the standard text of the status.
    const text = expose === true ? message : (STATUS_CODES[statusCode] ?? 'Bad Request');
    return new HttpException({ statusCode, message: text }, statusCode);
  }
}
