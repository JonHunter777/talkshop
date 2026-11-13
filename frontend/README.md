# Frontend

Web client of Talkshop: Vite 8, React 19, TypeScript 6, Tailwind CSS v4. At the moment it is a skeleton page that shows the backend API status.

## Requirements

- Node.js from [`../.nvmrc`](../.nvmrc) (24), npm
- Backend running on port 3000 (see [`../backend/README.md`](../backend/README.md))

## Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev   # http://localhost:5173
```

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL with the `/api` prefix, e.g. `http://localhost:3000/api`. It ends up in the browser bundle, so never put secrets here. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type check (`tsc -b`) and production build |
| `npm run preview` | Preview the production build |
| `npm run lint` / `lint:fix` | ESLint (check / autofix) |
| `npm run format` / `format:check` | Prettier (write / check) |
| `npm run test` | Run tests once (Vitest) |
| `npm run test:watch` | Tests in watch mode |

## Stack

React 19, Vite 8, TypeScript 6, Tailwind CSS v4, Vitest + React Testing Library, ESLint + Prettier. Font: IBM Plex Sans.

## Design tokens

Colors, spacing and other tokens live in `@theme` in [`src/index.css`](./src/index.css). Tailwind v4 has no `tailwind.config`. The rules and the token list are in [`../DESIGN.md`](../DESIGN.md) (section 11).

## Tests

Tests run in jsdom with Vitest and Testing Library; the API is mocked, so no backend is needed.
