// Checks that the OpenAPI document describes every route and marks the protected ones.
// The app is built here and not with createTestApp(): Swagger has to be set up in the same
// order as in src/main.ts, BEFORE the app is initialised, and createTestApp() already
// initialises it.
//
// test-config must be imported before AppModule (see the comment in that file).
import './helpers/test-config';
import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { setupSwagger } from '../src/swagger.setup';
import { dropTestDb, syncAllIndexes } from './helpers/test-db';

type Method = 'get' | 'post' | 'patch' | 'delete';
type Route = [Method, string];

const PUBLIC_ROUTES: Route[] = [
  ['get', '/api/health'],
  ['post', '/api/auth/register'],
  ['post', '/api/auth/login'],
  ['get', '/api/products'],
  ['get', '/api/products/slug/{slug}'],
  ['get', '/api/products/{id}'],
];

// Need a Bearer token (some of them also need the admin role)
const PROTECTED_ROUTES: Route[] = [
  ['get', '/api/auth/me'],
  ['post', '/api/products'],
  ['patch', '/api/products/{id}'],
  ['delete', '/api/products/{id}'],
  ['get', '/api/cart'],
  ['post', '/api/cart/items'],
  ['patch', '/api/cart/items/{productId}'],
  ['delete', '/api/cart/items/{productId}'],
  ['delete', '/api/cart'],
  ['post', '/api/orders'],
  ['get', '/api/orders'],
  ['get', '/api/orders/all'],
  ['get', '/api/orders/all/{id}'],
  ['patch', '/api/orders/{id}/status'],
  ['post', '/api/orders/{id}/cancel'],
  ['get', '/api/orders/{id}'],
];

const ALL_ROUTES: Route[] = [...PUBLIC_ROUTES, ...PROTECTED_ROUTES];

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

const routeName = ([method, path]: Route): string => `${method.toUpperCase()} ${path}`;

describe('Swagger coverage (e2e)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  const operationOf = ([method, path]: Route) => document.paths[path]?.[method];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    setupSwagger(app, true);
    await app.init();
    await syncAllIndexes(app);

    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    document = res.body as OpenAPIObject;
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  it.each(ALL_ROUTES)('documents %s %s', (method, path) => {
    expect(operationOf([method, path])).toBeDefined();
  });

  it('documents no routes besides the expected ones', () => {
    const documented = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.keys(item)
        .filter((key) => HTTP_METHODS.includes(key))
        .map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(documented.sort()).toEqual(ALL_ROUTES.map(routeName).sort());
  });

  it('declares the bearer security scheme', () => {
    expect(document.components?.securitySchemes?.['bearer']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it.each(PROTECTED_ROUTES)('requires bearer auth for %s %s', (method, path) => {
    expect(operationOf([method, path])?.security).toContainEqual({ bearer: [] });
  });

  it('does not require auth globally', () => {
    expect(document.security ?? []).toEqual([]);
  });

  it.each(PUBLIC_ROUTES)('requires no auth for %s %s', (method, path) => {
    const operation = operationOf([method, path]);

    expect(operation).toBeDefined();
    expect(operation?.security ?? []).toEqual([]);
  });
});
