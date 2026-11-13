# Talkshop

An online store with AI agents: a shopper chats with a consultant that searches for products, compares them and offers to add them to the cart; a support agent answers questions about orders; an admin gets AI help with product descriptions and analytics. This is a learning and portfolio project.

## Tech stack

- **Backend:** Node.js LTS, NestJS, TypeScript, Mongoose, JWT, Swagger
- **Database:** MongoDB Atlas
- **Frontend:** React, Vite, TypeScript, Tailwind CSS, TanStack Query, Zustand, React Router
- **AI:** Anthropic SDK (tool use, SSE streaming, prompt caching)
- **Testing:** Jest, Supertest, Vitest, React Testing Library, Playwright
- **Deploy:** Vercel (frontend), Render or Railway (backend), GitHub Actions (CI)

## Getting started

Status: early stage. The skeleton is ready (backend with health check and Swagger, frontend page that shows the API status). Shop features and AI agents are planned, see [`PLAN.md`](./PLAN.md) (in Russian).

### Requirements

- Node.js from [`.nvmrc`](./.nvmrc) (24) and npm. With nvm: `nvm use`
- A MongoDB Atlas cluster (a separate dev database)

### Install and configure

```bash
# backend
cd backend
npm install
cp .env.example .env   # set MONGODB_URI

# frontend
cd ../frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:3000/api
```

### Run

Use two terminals:

```bash
cd backend && npm run start:dev    # http://localhost:3000, Swagger: /api/docs
cd frontend && npm run dev         # http://localhost:5173
```

Check: `http://localhost:3000/api/health` should return `db: up`, and the frontend page should show the API status.

## Scripts

| Part | Commands |
|---|---|
| Backend | `start:dev`, `build`, `start:prod`, `lint`, `lint:fix`, `format`, `format:check`, `test`, `test:cov`, `test:e2e` |
| Frontend | `dev`, `build`, `preview`, `lint`, `lint:fix`, `format`, `format:check`, `test`, `test:watch` |

Run them with `npm run <name>` inside `backend/` or `frontend/`. Details: [`backend/README.md`](./backend/README.md), [`frontend/README.md`](./frontend/README.md).

## Project structure

```
.
├── backend/        # NestJS API (config, health, Swagger)
├── frontend/       # Vite + React app
├── .claude/        # Claude Code agents and skills (dev workflow)
├── CLAUDE.md       # project rules
├── PLAN.md         # stage checklist and journal (Russian)
├── DESIGN.md       # design tokens and UI rules
├── docs/           # planned
├── backend/evals/  # planned
└── .mcp.json       # planned
```
