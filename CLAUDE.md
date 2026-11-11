# AI-магазин — CLAUDE.md

Интернет-магазин с AI-агентами: покупатель общается с консультантом, который сам ищет
товары, сравнивает их и предлагает добавить в корзину; поддержка отвечает по заказам;
админ получает AI-помощь с описаниями товаров и аналитикой.

Разработчик — junior (верстальщик → fullstack / AI web developer). Проект учебный и для
портфолио: важны **понятный код, объяснения и честные отчёты**, а не скорость любой ценой.

Текущий этап и прогресс — в [`PLAN.md`](./PLAN.md). **Читай его в начале каждой сессии.**

---

## Стек

| Часть | Технологии |
|---|---|
| Backend | Node.js LTS, **NestJS**, TypeScript (strict), Mongoose, class-validator, Swagger, JWT, `@nestjs/throttler` |
| База | **MongoDB Atlas** (dev и prod — разные базы) |
| Frontend | **React**, Vite, TypeScript, Tailwind CSS, TanStack Query, Zustand, React Router, react-hook-form + zod |
| AI | `@anthropic-ai/sdk`, tool use, SSE-стриминг, prompt caching, Zod для валидации |
| Тесты | Jest, Supertest, mongodb-memory-server, Vitest, React Testing Library, MSW, Playwright |
| Деплой | Vercel (frontend), Render или Railway (backend), MongoDB Atlas, GitHub Actions (CI) |

Новые библиотеки — только после объяснения и согласия разработчика.

---

## Структура

```
ai-shop/
├── CLAUDE.md
├── PLAN.md
├── .env.example
├── .mcp.json
├── .claude/
│   ├── settings.json
│   ├── agents/          # 11 субагентов
│   └── skills/          # nest-module, react-feature, pre-commit, explain
├── backend/
│   ├── src/
│   │   ├── auth/  users/  products/  cart/  orders/  support/  admin/
│   │   ├── ai/          # агенты, промпты, tools, agent loop, router, aiLogs
│   │   ├── assistant/   # чат: SSE, chatSessions, /assistant/confirm
│   │   └── common/      # guards, decorators, pipes, filters
│   ├── scripts/seed.ts
│   ├── evals/
│   └── test/
├── frontend/
│   └── src/
│       ├── app/  pages/
│       ├── features/    # catalog, cart, auth, orders, assistant, admin
│       ├── shared/      # ui, lib (apiClient, formatPrice), hooks
│       └── types/       # типы API и SSE-событий
└── docs/
```

---

## Команды

```bash
# backend
cd backend
npm run start:dev      # dev-сервер, Swagger: http://localhost:3000/api/docs
npm run lint
npm run build
npm run test
npm run test:e2e
npm run seed           # тестовые данные, только dev-база
npm run evals          # AI-evals, реальный API — стоит денег, только с подтверждением

# frontend
cd frontend
npm run dev            # http://localhost:5173
npm run lint
npm run build
npm run test
```

Если команды ещё нет в `package.json` — не выдумывай её результат, скажи, что её нужно добавить.

---

## Агенты

Всех агентов запускает **главный Claude (оркестратор)**. Субагенты не вызывают друг друга —
если агенту нужна работа другого, он пишет об этом в отчёте, а оркестратор решает, кого вызвать.

| Агент | Зона | Меняет код | Когда |
|---|---|---|---|
| `architect` | план этапа или фичи | ❌ | в начале каждого этапа/фичи |
| `backend-dev` | `backend/src` (кроме `ai/`, `assistant/`) | ✅ | реализация API |
| `frontend-dev` | `frontend/` | ✅ | реализация UI |
| `ai-engineer` | `backend/src/ai`, `backend/src/assistant` | ✅ | AI-агенты, tools, стриминг |
| `db-specialist` | схемы, индексы, агрегации, `scripts/seed.ts` | ✅ | данные и запросы |
| `test-writer` | файлы тестов | ✅ только тесты | после каждого модуля/фичи |
| `code-reviewer` | весь diff | ❌ | перед каждым коммитом |
| `security-auditor` | весь проект | ❌ | после AI-этапов, auth/orders, перед деплоем |
| `eval-runner` | `backend/evals/` | ✅ только evals | после изменений промптов/tools/моделей |
| `docs-writer` | `*.md`, `docs/` | ✅ только документация | в конце этапа |
| `devops` | конфиги деплоя, CI | ✅ только конфиги | этап деплоя |

## Скиллы

| Скилл | Кто использует | Зачем |
|---|---|---|
| `/nest-module` | `backend-dev` | новый модуль NestJS по правилам проекта |
| `/react-feature` | `frontend-dev` | новая фича во frontend по правилам проекта |
| `/pre-commit` | разработчик (вручную) | проверки + ревью + сообщение коммита |
| `/explain` | разработчик | объяснение кода простым языком |

---

## Процесс одного этапа (для оркестратора)

1. **Прочитать** `PLAN.md` → определить текущий этап.
2. **`architect`** → план этапа.
3. **⏸ Стоп.** Показать план разработчику и **ждать подтверждения**. Без «ок» — дальше не идти.
4. **Исполнители** по шагам плана: `db-specialist` → `backend-dev` → `ai-engineer` → `frontend-dev`
   (в порядке, указанном в плане; по одному шагу, с проверками после каждого).
5. **`test-writer`** → тесты на новое. Найденные баги → обратно нужному исполнителю.
6. **`code-reviewer`** → ревью diff. 🔴 и 🟡 → исправить и повторить ревью.
7. Если этап затрагивает AI (`ai/`, `assistant/`, промпты, tools):
   - **`eval-runner`** — сначала сообщить стоимость прогона и получить подтверждение;
   - **`security-auditor`**.
   Если затрагивает `auth/`, `orders/` — тоже `security-auditor`.
8. **`docs-writer`** → обновить README/docs/CHANGELOG.
9. **Итоговый отчёт** разработчику (см. правило 5) + предложить `/pre-commit`.
10. **⏸ Стоп.** Разработчик сам делает коммит.
11. Отметить выполненное в `PLAN.md` (`- [x]`) и кратко записать, что сделано и что осталось.

Не начинай следующий этап, пока разработчик явно не скажет «дальше».

---

## Ключевые правила проекта

- **Деньги** — целые числа в центах (`priceCents`), никогда float.
- **`userId`** — только из JWT (`@CurrentUser()`), никогда из body, query или аргументов модели.
- **Доступ к ресурсам** — проверка владельца в сервисе (свои заказы, корзина, чат).
- **AI tools:** вход валидируется Zod; `userId`/роль приходят через `ToolContext` с сервера;
  действия, меняющие данные (`addToCart`, `createReturnRequest`, `updateProductDraft`),
  выполняются **только после подтверждения пользователя** (`pendingAction` + `/assistant/confirm`).
- **AI конфиг:** модели, лимиты и цены — только из env; каждый вызов модели пишется в `aiLogs`;
  промпты версионируются; реальный API **не вызывается** в unit-тестах.
- **Секреты** — только в `.env`. `.env` не читать, не выводить, не коммитить. Новая переменная → `.env.example`.

---

## Правила для всех агентов

1. **Сначала понять.** Прочитай `CLAUDE.md`, `PLAN.md`, план `architect` и существующий код.
   Неясно — спроси, не угадывай.
2. **Только своя зона.** Меняй только свои файлы (см. таблицу агентов).
   Нужна правка в чужой зоне — опиши задачу для нужного агента.
3. **Безопасность прежде всего.** Секреты только в `.env`. `userId` только из JWT.
   AI меняет данные только после подтверждения пользователя.
   Без согласия разработчика: не удалять данные, не ставить пакеты, не делать commit / push / deploy.
4. **Маленькие шаги.** После каждого шага: lint, build, test. Упало — исправь до следующего шага.
   Без `any`, `@ts-ignore` и отключения проверок.
5. **Честный отчёт на русском.** Что сделано, как проверить, результаты проверок,
   блок «Что объяснить» (2–4 пункта). Не выдумывай. Не получилось — так и скажи.

---

## Язык

- Общение, планы и отчёты — **на русском**.
- Код, имена, комментарии в коде, сообщения коммитов, главный `README.md` — **на английском**.