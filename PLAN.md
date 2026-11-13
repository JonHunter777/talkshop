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

### 2026-11-12 — Этап 0, промежуточный итог (шаги 0–2 из 10)
Остановились перед шагом 3. Ни один пункт чек-листа этапа 0 целиком не закрыт. Коммитов нет, все изменения в рабочей копии.

**Сделано**
- Шаг 0: `.claude/settings.JSON` → `settings.json`; агенты `arxitect.md` → `architect.md`, `backed.md` → `backend-dev.md`, `frond-end.md` → `frontend-dev.md` (через `git mv`). В `deny` вместо `Read(./.env.*)` конкретные имена (`.env.local/.development/.production/.test`), чтобы `.env.example` читался. `.nvmrc` = `24`.
- Шаг 1 (devops): расширен `.gitignore` (с `!.env.example`), добавлены `.editorconfig`, `.gitattributes` (LF), минимальный `README.md`.
- Шаг 2 (backend-dev): `backend/` создан через `nest new --skip-git --package-manager npm`. Nest CLI 12 сгенерировал Vitest + oxlint + ESM, что не совпадает с CLAUDE.md, поэтому по решению разработчика backend переведён на **Jest + ESLint (CommonJS)**. Для этого Nest откатили с 12 на **11** (пакеты Nest 12 ESM-only, Jest в CJS их не грузит). TypeScript 6, `strict: true` полностью, `module`/`moduleResolution: nodenext` (пакет остаётся CJS, без `"type": "module"`).
- Проверено оркестратором: build, test (1/1), test:e2e (1/1), lint — зелёные. `dist/` собирается после удаления устаревшего `tsconfig.build.tsbuildinfo`.

**Решения разработчика**
- Tailwind v4; Vitest во frontend ставим сейчас (один smoke-тест); npm без pnpm/yarn; `.env.example` — по файлу в `backend/` и `frontend/`; на заглушке показываем статус API; проект не в OneDrive; origin на GitHub уже настроен.
- Atlas: кластер создаёт разработчик сам. `backend/.env` пока не создан.

**Осталось (этап 0)**
- Шаг 3: `@nestjs/config` с валидацией env, Mongoose, префикс `api`, `ValidationPipe`, CORS, модуль health (200 с `db: up` или 503) + тесты. Нужны пакеты `@nestjs/config`, `@nestjs/mongoose`, `mongoose`, `class-validator`, `class-transformer` — ждём согласия.
- Шаг 4: Swagger на `/api/docs`, только вне production. Шаг 5: ESLint/Prettier в backend (ужесточить `no-explicit-any`, `no-floating-promises`; сейчас правила как в шаблоне Nest, `any` выключен, floating-promises — warn), скрипты lint/format.
- Шаги 6–8: frontend (Vite react-ts, Tailwind v4, Vitest, заглушка со статусом API, `VITE_API_URL`), ESLint/Prettier во frontend, `.env.example` в обеих частях и сквозная проверка.
- Шаги 9–10: code-reviewer, `/pre-commit`, коммит и push делает разработчик; затем отметить пункты этапа 0.

**Открытые вопросы / долги**
- Создать кластер Atlas и `backend/.env` (`MONGODB_URI` с базой вроде `ai-shop-dev`) до проверки health на реальной базе.
- Сгенерированные `backend/AGENTS.md` и `backend/README.md` упоминают vitest/oxlint — поправить `docs-writer` в конце этапа.
- Когда выйдет TypeScript 7 / появится нужда в Nest 12 — отдельно решать миграцию (Nest 11 выбран сознательно).

### 2026-11-12 (вечер) — Этап 0 в процессе, шаги 1–4 из 10 выполнены
Этап 0 **не завершён**, чекбоксы этапа не отмечены. Следующий шаг — **шаг 5** (ESLint/Prettier в backend), не запущен.

**Сделано**
- Шаги 1–2 (конфиги и каркас): см. запись выше. Дополнительно в `backend/tsconfig.build.json` добавлен `"incremental": false`: устаревший `tsconfig.build.tsbuildinfo` оставлял `dist/` пустым при «успешной» сборке.
- Шаг 3 (config + Mongoose + health), закоммичен разработчиком: `@nestjs/config` с валидацией env (`PORT`, `NODE_ENV`, `MONGODB_URI`, `CORS_ORIGIN`; значения в ошибках не печатаются), `MongooseModule.forRootAsync`, префикс `api`, `ValidationPipe`, CORS, `GET /api/health` (200 `db: up` или 503 `db: down`, реальный `ping`), `backend/.env.example`. Пакеты под Nest 11: `@nestjs/config ^4.0.4`, `@nestjs/mongoose ^11.0.4`, `mongoose ^9.12.1`, `class-validator`, `class-transformer`. По отчёту агента, реальный Atlas ответил 200; подключение занимает ~14 с.
- Шаг 4 (Swagger): `@nestjs/swagger ^11.4.8`, `src/swagger.setup.ts`, документация на `/api/docs` (JSON — `/api/docs-json`) только при `NODE_ENV !== 'production'`, DTO ответов health, e2e-тест (в production 404). Шаг 4 пока **не закоммичен**.
- Проверено оркестратором после шага 4: lint и build чистые, `npm test` 9/9, `npm run test:e2e` 4/4.
- **Запрет остановки процессов по имени:** в `.claude/settings.json` (раздел `deny`) добавлены `taskkill /IM`, `//IM`, `/F /IM`, `//F //IM`, `/f /im`, `//f //im`, `pkill`, `killall`; в `CLAUDE.md` («Ключевые правила проекта») добавлено правило «останавливать только по PID». Поводом стала попытка агента на шаге 4 выполнить `taskkill /IM node.exe`, система прав её заблокировала. Остановка по `taskkill /PID` разрешена.

**Осталось (этап 0)**
- Шаг 5: ESLint/Prettier в backend — ужесточить `no-explicit-any` и `no-floating-promises` до error (сейчас по шаблону Nest: `any` выключен, floating-promises — warn), скрипты `lint` и `format` (+ при необходимости `format:check`). Исполнитель — `devops`. Новые пакеты не нужны.
- Шаги 6–8: frontend (Vite react-ts, Tailwind v4, Vitest + один smoke-тест, заглушка «API: ok», `VITE_API_URL`), ESLint/Prettier во frontend, `.env.example` в обеих частях, сквозная проверка.
- Шаги 9–10: `code-reviewer`, `/pre-commit`, коммит и push делает разработчик; затем отметить пункты этапа 0.

**Не закоммичено в рабочей копии:** шаг 4, правки `.claude/settings.json`, `CLAUDE.md`, `tsconfig.build.json`, записи в `PLAN.md`. Перед коммитом проверить `git status`: ранее часть файлов `backend/` оказалась в индексе без явной команды.

**Открытые вопросы / долги**
- Prettier не запускать по всему проекту без проверки: он переформатирует `test/jest-e2e.json` (агент шага 4 откатил это). Конфиг форматирования задаёт шаг 5.
- `backend/AGENTS.md` и `backend/README.md` упоминают vitest/oxlint — поправить `docs-writer` в конце этапа.
- `npm audit` показывает предупреждения — разобрать отдельно.
- Миграция на Nest 12 / TypeScript 7 — позже, осознанно.