# AGENTS.md (backend)

Facts about this package. If something here conflicts with generated templates, trust this file.

- NestJS 11, TypeScript, **CommonJS** (no `"type": "module"`). Imports are relative and **without** `.js`.
- Tests run on **Jest** (`jest.fn()`, `jest.spyOn()`), e2e with Supertest. Not Vitest.
- DTOs use `class-validator` / `class-transformer`; the global `ValidationPipe` is enabled.
- Money is stored as integer cents (`priceCents`), never floats.
- `userId` comes only from the JWT (`@CurrentUser()`), never from body, query or AI tool arguments.
- No new libraries without the developer's approval.
- Before finishing a task run: `npm run lint`, `npm run build`, `npm run test`, `npm run test:e2e`.
- Project-wide rules: see [`../CLAUDE.md`](../CLAUDE.md).
