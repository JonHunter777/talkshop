PLAN.md — AI-магазин
Чек-лист этапов. Оркестратор читает этот файл в начале каждой сессии, отмечает выполненное - [x] и пишет короткий итог в «Журнал».
Текущий этап: 0
Этап 0. Подготовка
[ ] Монорепо: папки backend/ (NestJS) и frontend/ (Vite + React + TS + Tailwind)
[ ] ESLint + Prettier в обеих частях
[ ] .gitignore, .env.example
[ ] Подключение к MongoDB Atlas (dev), GET /api/health
[ ] Swagger на /api/docs
• Готово, когда: backend и frontend запускаются, health check отвечает, первый коммит на GitHub
Этап 1. Backend-основа
[ ] Модули users, auth (JWT, bcrypt), products, cart, orders
[ ] DTO, валидация, guards, пагинация, цены в центах
[ ] Сид-скрипт: 40–60 товаров, 2 пользователя, несколько заказов
[ ] Unit- и e2e-тесты
• Готово, когда: весь API магазина проверяется в Swagger
Этап 2. Frontend магазина
[ ] Каталог с фильтрами и поиском, карточка товара
[ ] Корзина, оформление заказа
[ ] Регистрация, логин, «Мои заказы»
[ ] Состояния loading / error / empty, адаптив 360–1280px
• Готово, когда: обычный магазин работает от начала до конца, без ИИ
Этап 3. Первая AI-фича
[ ] Модуль ai: клиент Anthropic, конфиг из env
[ ] Коллекция aiLogs, CostService
[ ] Кнопка «Сгенерировать описание» в админке
• Готово, когда: описание генерируется, вызов виден в aiLogs со стоимостью
Этап 4. Shopping Agent
[ ] Tools: searchProducts, getProduct, compareProducts, addToCart
[ ] Agent loop вручную, лимит шагов
[ ] SSE-стриминг, карточки товаров в чате
[ ] Human-in-the-loop: pendingAction + /assistant/confirm
[ ] История в chatSessions
• Готово, когда: «подарок до 50€ для йоги» → подходящие товары → добавление в корзину после подтверждения
Этап 5. Support Agent + Router
[ ] Tools заказов, escalateToHuman, коллекция supportTickets
[ ] Router на быстрой модели с fallback
[ ] security-auditor
• Готово, когда: один чат, два агента, чужие заказы недоступны
Этап 6. Admin-агенты
[ ] Content Agent: описания и переводы в черновик
[ ] Analytics Agent: продажи, низкий остаток
• Готово, когда: админ получает ответы по данным магазина
Этап 7. AI Engineering
[ ] Evals: 50+ случаев, baseline
[ ] Rate limit, лимиты токенов, защита от prompt injection
[ ] Prompt caching, дашборд стоимости
• Готово, когда: evals проходят, отчёт security-auditor без 🔴
Этап 8. Деплой и упаковка
[ ] Vercel, Render/Railway, Atlas prod
[ ] CI в GitHub Actions
[ ] README для портфолио, GIF-демо
• Готово, когда: живая ссылка работает, README готов
Бонус
[ ] MCP-сервер магазина
[ ] Atlas Vector Search
[ ] Голосовой ввод в чате
Журнал
Сюда оркестратор записывает после каждого этапа: дата, что сделано, что осталось, открытые вопросы.

### 2026-11-13 — Этап 0: шаги 0–8 выполнены, идёт финальная чистка
Этап 0 **не завершён**, чекбоксы этапа не отмечены (ждём `/pre-commit` и коммит разработчика). Шаги 0–8 из 10 сделаны, шаг 9 (полное код-ревью этапа) проведён, шаг 10 — коммит и отметка чекбоксов.

**Сделано**
- Шаг 0: `.claude/settings.JSON` → `settings.json`; агенты переименованы (`architect`, `backend-dev`, `frontend-dev`); в `deny` конкретные `.env.*` вместо маски, чтобы `.env.example` читался; `.nvmrc` = `24`.
- Шаг 1 (devops): `.gitignore` (с `!.env.example`), `.editorconfig`, `.gitattributes` (LF), минимальный `README.md`.
- Шаг 2 (backend): Nest CLI 12 сгенерировал Vitest + oxlint + ESM, что не совпадает с CLAUDE.md. По решению разработчика: **Nest 11 + Jest + ESLint, CommonJS** (пакеты Nest 12 ESM-only). TypeScript 6, `strict`, `module`/`moduleResolution: nodenext` без `"type": "module"`. В `tsconfig.build.json` `"incremental": false` (устаревший tsbuildinfo оставлял `dist/` пустым).
- Шаг 3: `@nestjs/config` с валидацией env (`PORT`, `NODE_ENV`, `MONGODB_URI`, `CORS_ORIGIN`; значения в ошибках не печатаются), Mongoose 9 (`forRootAsync`), префикс `api`, `ValidationPipe`, CORS, `GET /api/health` (200 `db: up` / 503 `db: down`, реальный `ping`).
- Шаг 4: Swagger на `/api/docs` (JSON — `/api/docs-json`) только при `NODE_ENV !== 'production'`, e2e-тест (в production 404).
- Шаг 5: ESLint 10 + Prettier в backend, строгие правила (`no-explicit-any`, `no-floating-promises` — error), скрипты `lint`, `lint:fix`, `format`, `format:check`.
- Шаги 6–8: frontend — **Vite 8, React 19, TypeScript 6, Tailwind v4** (токены в `@theme` в `src/index.css`, см. DESIGN.md, раздел 11), **Vitest** + Testing Library, ESLint + Prettier; заглушка со статусом API, `VITE_API_URL`; `.env.example` в `backend/` и `frontend/`.
- **Запрет остановки процессов по имени:** в `.claude/settings.json` (`deny`) добавлены `taskkill /IM` и варианты, `pkill`, `killall`; в `CLAUDE.md` правило «останавливать только по PID». Поводом стала попытка агента выполнить `taskkill /IM node.exe`.
- **Код-ревью всего этапа проведено.** Исправлено в этой чистке: README (корень, backend, frontend), `backend/AGENTS.md` (был сгенерирован Nest CLI 12 и описывал ESM/Vitest), ссылки на `tailwind.config` в `frontend-dev.md` и `react-feature`, шаги проверок в `pre-commit` (`format:check`, без `--if-present`), название в Swagger, чистка пакетов, контраст в UI, тесты на env, права в `.claude/settings.json` (по решению разработчика). Всё, кроме документации, делали другие агенты.

**Решения разработчика**
- Tailwind v4; Vitest во frontend; только npm; `.env.example` по файлу в каждой части; проект не в OneDrive; origin на GitHub настроен; кластер Atlas создан разработчиком, health на реальной базе проверен.
- Nest 11 выбран сознательно; миграция на Nest 12 / TypeScript 7 — отдельное решение позже.

**Осталось (этап 0)**
- `/pre-commit`, коммит и push делает разработчик; затем отметить пункты этапа 0 и обновить «Текущий этап».
- Prettier не запускать по всему проекту без проверки: он переформатирует `backend/test/jest-e2e.json`.

### Долги
- CORS по списку доменов вместо одного origin — этап 8.
- `npm audit`: 10 moderate во frontend (цепочка eslint) и предупреждения в backend — этап 8.
- Решение по языку интерфейса (uk/en) — до этапа 2.
- TanStack Query вместо `useState` + `fetch` в `useApiHealth` — этап 2.
- helmet, `@nestjs/throttler` и глобальный exception filter — этап 1/7.
- Явный `"strict": true` и `"engines"` в `package.json` обеих частей — nice to have.
- В `CLAUDE.md` пометить `docs/`, `.mcp.json`, `backend/evals/` как запланированные (их ещё нет); `CLAUDE.md` не правили, только фиксируем.
