# Backend

REST API of Talkshop, built with NestJS 11 (CommonJS), Mongoose 9 and MongoDB Atlas. At the moment it contains the project skeleton: config with env validation, database connection, a health endpoint and Swagger.

## Requirements

- Node.js from [`../.nvmrc`](../.nvmrc) (24), npm
- A MongoDB Atlas cluster (use a separate database for dev, for example `ai-shop-dev`)

## Setup

```bash
cd backend
npm install
cp .env.example .env   # then fill in real values
npm run start:dev
```

Variables (see [`.env.example`](./.env.example)):

| Variable | Description |
|---|---|
| `PORT` | HTTP port, default `3000` |
| `NODE_ENV` | `development`, `production` or `test` |
| `MONGODB_URI` | Atlas connection string (required) |
| `CORS_ORIGIN` | Allowed frontend origin, default `http://localhost:5173` |

## Endpoints

- Health check: `GET http://localhost:3000/api/health` (200 with `db: up`, or 503 with `db: down`)
- Swagger UI: http://localhost:3000/api/docs (only when `NODE_ENV` is not `production`)

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | Dev server with watch |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled app |
| `npm run lint` / `lint:fix` | ESLint (check / autofix) |
| `npm run format` / `format:check` | Prettier (write / check) |
| `npm run test` | Unit tests (Jest) |
| `npm run test:cov` | Unit tests with coverage |
| `npm run test:e2e` | e2e tests (Jest + Supertest) |

## Tests

Unit tests live next to the code as `*.spec.ts`; e2e tests are in [`test/`](./test). Tests do not need a real database or API keys.
