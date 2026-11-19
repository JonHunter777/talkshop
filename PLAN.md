PLAN.md — AI-магазин
Чек-лист этапов. Оркестратор читает этот файл в начале каждой сессии, отмечает выполненное - [x] и пишет короткий итог в «Журнал».
Текущий этап: 1 (план утверждён 2026-11-16, исполнение не начато; шаг 1 требует отдельного «ок» на установку пакетов)
Этап 0. Подготовка
[x] Монорепо: папки backend/ (NestJS) и frontend/ (Vite + React + TS + Tailwind)
[x] ESLint + Prettier в обеих частях
[x] .gitignore, .env.example
[x] Подключение к MongoDB Atlas (dev), GET /api/health
[x] Swagger на /api/docs
• Готово, когда: backend и frontend запускаются, health check отвечает, первый коммит на GitHub
Этап 1. Backend-основа
[ ] Модули users, auth (JWT, bcrypt), products, cart, orders
[ ] DTO, валидация, guards, пагинация, цены в центах
[ ] Сид-скрипт: 30–50 товаров в 6 категориях, admin и демо-покупатель, без заказов (заказы в сиде — этап 5)
[ ] Unit- и e2e-тесты
• Готово, когда: весь API магазина проверяется в Swagger

#### План этапа 1 (составил architect, утверждён разработчиком 2026-11-16; исполнение не начато)

**Решения по 12 вопросам** (приняты дефолты architect, кроме п. 8 и 12 — уточнены разработчиком)
1. Цена — целое `priceCents` в копейках, валюта UAH: константа `CURRENCY` в `common/constants/shop.ts`, в заказе поле `currency`. Форматирует только frontend. Диапазон `1..100_000_000`.
2. `slug` товара задаёт админ в теле запроса (автогенерация из кириллицы потребовала бы библиотеки).
3. Удаление товара — hard delete: заказы хранят снапшот, из корзины пропавший товар показывается с `available: false`.
4. В заказ добавляются `shipping` (`fullName`, `phone`, `city`, `address`) и необязательный `note`. Оплаты нет.
5. Отмена заказа — только админом через смену статуса; покупатель отменять не может (позже).
6. Хеш паролей — `bcryptjs ^3` (bcrypt на чистом JS, без node-gyp на Windows/Node 24).
7. Пакеты (установка только на шаге 1, после отдельного «ок»): `@nestjs/jwt ^11.0.2`, `bcryptjs ^3.0.3`, `@nestjs/throttler ^6.8.0`, `mongodb-memory-server ^11.3.0` (dev). Не ставим: `passport*`, `bcrypt`, `argon2`, `helmet`, `tsx`, `ts-node`, `slugify`, `uuid`.
8. Сид лежит в `backend/src/seed/` (не `scripts/seed.ts`): не нужны `tsx`/`ts-node`, `nest build` компилирует всё. `CLAUDE.md` обновлён (структура и зона `db-specialist`).
9. Сид создаёт admin и одного демо-покупателя; пароли и email — из `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` (проверяются внутри сида, не в общей валидации env; в `.env.example` — плейсхолдеры).
10. Заказы в сиде — этап 5.
11. JWT живёт 1 час (`JWT_EXPIRES_IN_SECONDS=3600`, допустимо 60..604800), `JWT_SECRET` не короче 32 символов; refresh-токенов нет.
12. Имя dev-базы в Atlas оканчивается на `-dev`: у разработчика это `talkshop-dev`. Сид отказывается работать, если `NODE_ENV=production` или имя базы не оканчивается на `-dev`/`-test`; в лог пишется только имя базы, не URI. (Пример `ai-shop-dev` в `backend/.env.example` и `backend/README.md` заменить на `talkshop-dev` на шаге 1.)

**Данные сида**
- Только локальный JSON в `backend/src/seed/data/` (например `products.json`), читается при запуске с диска: никаких сетевых запросов при запуске сида.
- Картинки — только URL строками (внешние ссылки на сайты не проверяются и не скачиваются; загрузки файлов нет).
- Тексты товаров (названия, описания, материалы) пишутся своими словами, не копируются с JYSK и других магазинов. Цены — в копейках; несколько товаров с малым остатком для тестов.
- 30–50 товаров в категориях `kitchen`, `textile`, `decor`, `furniture`, `lighting`, `storage`. Идемпотентность: upsert по `slug`, остаток и пароли при повторном запуске не перезаписываются (`$setOnInsert`).
- Открытый вопрос до шага 9: на каком языке тексты товаров (uk/ru/en) — связано с решением по языку интерфейса из «Долгов».

**Структура** (`backend/src/`)
- `common/`: `constants/` (роли, `CURRENCY`, лимиты), `decorators/` (`@CurrentUser`, `@Roles`, `@Auth`), `guards/` (`JwtAuthGuard`, `RolesGuard`), `pipes/` (`ParseObjectIdPipe`), `dto/` (пагинация), `types/`, `utils/` (`isDuplicateKeyError`).
- `users/` (без контроллера), `auth/`, `products/`, `cart/`, `orders/`, `seed/` (`seed.ts` — CLI, `run-seed.ts` — чистая функция, `seed-guard.ts`, `data/`).
- `backend/test/`: `globalSetup`/`globalTeardown` (одна `MongoMemoryReplSet` на прогон, у каждого файла своя база), `helpers/`, `factories/`.
- Зависимости модулей без циклов: `auth → users`, `cart → products`, `orders → cart, products`; чужие модели — только через экспортируемый сервис. `JwtModule` глобальный.

**Схемы**
- `users`: `email` (lowercase, unique), `passwordHash` (`select: false`), `name`, `role` (`customer`|`admin`).
- `products`: `name`, `slug` (unique), `description`, `category` (6 значений), `priceCents`, `stock`, `images` (до 10 URL http/https), `attributes {material, size, color}`. Индексы: unique `slug`; `{category, priceCents}`; `{category, createdAt}`; text по `name` (вес 10), `attributes.material` и `attributes.color` (3), `description` (1), `default_language: 'none'` (поиск по целым словам, без морфологии: известное ограничение).
- `carts`: `userId` (unique), `items[{productId, quantity 1..99}]`, до 50 строк; цен и названий в корзине нет.
- `orders`: `orderNumber` (`TS-YYMMDD-XXXXXX`, unique), `userId`, `items[]` (снапшот: `productId`, `name`, `slug`, `priceCents`, `quantity`), `totalCents` (считает только сервер), `currency`, `status`, `shipping`, `note`. Индексы: `{userId, createdAt}`, `{status, createdAt}`.

**Эндпоинты** (префикс `/api`)
- auth: `POST /auth/register` и `POST /auth/login` (публичные, 5 запросов в минуту), `GET /auth/me`.
- products: `GET /products` (page, limit ≤ 50, category, minPriceCents, maxPriceCents, q ≤ 100, sort = newest|price_asc|price_desc|relevance), `GET /products/:id`, `GET /products/slug/:slug`; `POST`, `PATCH /:id`, `DELETE /:id` — только admin.
- cart (все под JWT): `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:productId`, `DELETE /cart/items/:productId`, `DELETE /cart`.
- orders: `POST /orders`; `GET /orders` и `GET /orders/:id` — только свои (чужой заказ → 404); `GET /orders/all` и `PATCH /orders/:id/status` — только admin.
- Ошибки — стандартный формат Nest (400 валидация и неверный id, 401, 403, 404, 409 дубли/остаток/переход статуса, 429); 422 не используем; 409 по остатку несёт список проблемных позиций. Глобальный exception filter — этап 7. Одинаковый 401 для «нет email» и «неверный пароль».

**Auth:** `@nestjs/jwt` и самописный `JwtAuthGuard` (без passport), HS256 зафиксирован, payload `{sub, role}`; `userId` и роль только из токена через `@CurrentUser()`; в `RegisterDto` нет `role` (лишнее поле → 400), первый admin создаётся только сидом; пароль 8..72 символа; защита от определения email по времени ответа (dummy-хеш).

**Checkout без overselling:** транзакция MongoDB (в тестах `MongoMemoryReplSet`). Внутри: корзина (пустая → 400), для каждой позиции условный `$inc` с `stock >= qty`; все нехватки собираются в один 409 с полным списком, при любой нехватке откат целиком (остатки, заказ и корзина не меняются); иначе заказ со снапшотом и очистка корзины. Главный риск — забытый `{ session }`; закрывается тестом на откат и ревью `db-specialist`.

**Статусы заказа** (меняет только admin; уточнено при планировании шага 8). Переходы через `PATCH /orders/:id/status`:

| Из \ В | processing | shipped | delivered |
|---|---|---|---|
| **pending** | ✅ | ❌ | ❌ |
| **processing** | ❌ | ✅ | ❌ |
| **shipped** | ❌ | ❌ | ✅ |
| **delivered** | финальный, всё ❌ | | |
| **cancelled** | финальный, всё ❌ | | |

Шаги не перепрыгиваются, тот же статус (`pending → pending`) недопустим. `PATCH` значение `cancelled` **не принимает** (400, статус и остатки не меняются). Переход атомарный (`findOneAndUpdate` с проверкой текущего статуса в самом запросе: нет заказа → 404, статус уже другой или переход запрещён → 409). **Отмена — единственным путём `POST /orders/:id/cancel` (admin)**, только из `pending` и `processing` (из `shipped` отменить нельзя). При отмене остатки по позициям возвращаются ровно один раз (`$inc: +quantity`; позиции, чьих товаров уже нет, пропускаются); повторная отмена даёт 409 и остаток не растёт. Смена статуса на `cancelled` и возврат остатков выполняются **в одной транзакции**, как checkout (все операции с `{ session }`): если возврат упадёт, статус остаётся прежним, остатки не меняются, повторная отмена возможна.

**Шаги** (после каждого `lint`, `build`, `test`, `test:e2e` зелёные; каждый шаг — отдельный коммит разработчика)
- [x] 1 ⏸ (нужно отдельное «ок» на пакеты) — установить 4 пакета; `JWT_SECRET` и `JWT_EXPIRES_IN_SECONDS` в `env.validation.ts`, его spec и `.env.example` (разработчик добавляет значения в свой `backend/.env` сам); `talkshop-dev` в примерах; тестовая инфраструктура (`globalSetup`, `helpers/create-test-app.ts`, `jest-e2e.json`); `persistAuthorization` в Swagger. Агенты: `backend-dev`, `test-writer`. Коммит: `chore(backend): add jwt, bcryptjs, throttler, memory-server and test infra`.
- [x] 2 — `common/`: константы, `ParseObjectIdPipe`, `PaginationQueryDto`, ответ с пагинацией, `isDuplicateKeyError`, тип `AuthUser`; `ThrottlerModule` в `AppModule` (100 запросов в минуту). Unit-тесты pipe и DTO. Агент: `backend-dev`. Коммит: `feat(backend): add common pipes, pagination dto and throttler`.
- [x] 3 — схема и модуль `users` (`UsersService`: `create`, `findByEmail`, `findById`, нормализация email, E11000 → 409; `passwordHash` не попадает в выборку по умолчанию). Агенты: `db-specialist` (схема и индекс), `backend-dev` (сервис). Коммит: `feat(backend): add users module`.
- [x] 4 — `auth`: register, login, me; `JwtAuthGuard`, `RolesGuard`, `@CurrentUser`, `@Roles`, `@Auth`; throttle 5 в минуту; Swagger. Агент: `backend-dev`. Коммит: `feat(backend): add auth with jwt, roles guard and throttling`.
- [x] 5 — `products`: схема с индексами и text-индексом, список с фильтрами, поиском, сортировкой и пагинацией, CRUD админа, методы для других модулей (`findManyByIds`, `decrementStock`). Уточнения: `GET /products/:id` публичный (нужен корзине); `PATCH` заменяет `attributes` целиком, без слияния; добавлен индекс `{createdAt: -1}` для списка без категории. Агенты: `db-specialist`, `backend-dev`. Коммит: `feat(backend): add products module with filters and text search`.
- [x] 6 — `cart`: атомарные `addItem`, `PATCH`, `DELETE`, очистка, `CartDto` (цены читаются из товаров, `available`, `exceedsStock`). Агенты: `db-specialist`, `backend-dev`. Коммит: `feat(backend): add cart module`.
- [x] 7 — `orders`: схема, `checkout` в транзакции, `orderNumber`, `GET /orders`, `GET /orders/:id`. Агенты: `db-specialist` (транзакция, ревью `{session}`), `backend-dev`. Коммит: `feat(backend): add orders checkout with transactions`.
- [ ] 8 — админка заказов, CORS/helmet, аудит зависимостей. Агенты: `backend-dev`, `db-specialist` (ревью `{ session }`). Каждая часть — отдельный коммит разработчика:
  - [x] 8-pre — роль admin проверяется в БД (`RolesGuard` читает только `role`; пользователь удалён → 401, роль не admin → 403; `UsersModule` глобальный). Коммит: `feat(backend): verify admin role in the database`.
  - [ ] 8a-1 — `GET /orders/all` (admin; пагинация, фильтр `status`, новые первыми; объявлен до `:id`); индексы `{createdAt: -1, _id: -1}` и `{status: 1, createdAt: -1, _id: -1}` (проверка через `explain`, без стадии `SORT`); `GET /orders/all/:id` (admin) возвращает любой заказ с `userId` (объявлен до `:id`); `GET /orders/:id` остаётся «только свои, чужой → 404» для всех ролей, включая admin. Роль в БД проверяет только `RolesGuard` (один механизм), `OrdersService` не знает про роли. Коммит: `feat(backend): add admin order list`.
  - [ ] 8a-2 — `PATCH /orders/:id/status` (допустимые переходы по таблице выше, `cancelled` → 400), чистая функция `canTransition` с тестом на всю матрицу; **`POST /orders/:id/cancel`** (admin): смена статуса с условием `pending`/`processing` и возврат остатков по снапшоту в одной транзакции, удалённый товар пропускается с `warn` в лог, повторная отмена → 409; `ProductsService.incrementStock(productId, qty, session)`; рефакторинг `placeOrder` → `reserveLines`. Коммит: `feat(backend): add order status transitions and cancel`.
  - [ ] 8b — CORS по списку (`CORS_ORIGIN` через запятую, валидация в схеме env, `.env.example`), общая `configureApp(app)` для `main.ts` и тестов, helmet (`helmet@8.3.0`, ставится только после отдельного «ок»). Коммит: `feat(backend): add cors origin list and helmet`.
  - [ ] 8c — `npm audit` (backend и frontend): только отчёт, ничего не обновлять без решения разработчика.
- [ ] 9 — сид: `src/seed/data/*.json`, `seed-guard.ts`, `run-seed.ts`, `seed.ts`, скрипт `seed` (`nest build && node dist/seed/seed.js`), seed-переменные в `.env.example`. Агент: `db-specialist`. Коммит: `feat(backend): add idempotent seed script`.
- [ ] 10 — сквозной e2e (регистрация → логин → каталог → корзина → checkout → мои заказы → админ меняет статус), полнота Swagger (все пути, схема `bearer`), ручной прогон в `/api/docs`. Агенты: `test-writer`, затем разработчик. Коммит: `test(backend): add full shop flow e2e and swagger coverage`.
- [ ] 11 — `code-reviewer` по всему diff (🔴 и 🟡 исправить), затем обязательный `security-auditor` (затронуты `auth/` и `orders/`). Коммит при правках: `fix(backend): ...`.
- [ ] 12 — документация (`docs-writer`): `backend/README.md` (эндпоинты, сид, env, тесты), отметки в `PLAN.md`, примеры «€» → гривны в `PLAN.md` и `db-specialist.md`. Коммит: `docs: stage 1 done`.

**Ключевые тесты**
- Общие: `env.validation` (короткий `JWT_SECRET` → ошибка без значения в тексте, TTL вне диапазона), `ParseObjectIdPipe` (строго 24 hex), пагинация (`page=0`, `limit=51` → 400), guards (нет заголовка, чужая подпись, просроченный токен, другой алгоритм → 401; customer на admin-маршруте → 403).
- auth: хеш не равен паролю, в ответе нет `passwordHash`, email нормализуется (`A@B.com ` → `a@b.com`, повтор → 409), `role: 'admin'` в теле → 400, пароль 7 и 73 символа → 400, одинаковый 401 для неверного пароля и несуществующего email, `/auth/me` без токена 401 и по токену удалённого пользователя 404, 6-й логин за минуту → 429.
- products: дефолты пагинации, `limit=51` → 400, границы цены включительно, `min>max` → 400, неизвестная категория → 400, поиск по названию, материалу и цвету (название весит больше описания, регистр не важен), `sort=relevance` без `q` → 400, CRUD только admin (без токена 401, customer 403), дубль `slug` → 409 на уровне БД, `priceCents` дробный или 0 → 400, невалидный URL картинки → 400.
- cart: все маршруты без токена → 401; повторное добавление суммирует; `quantity` 0, 100, 1.5 → 400; несуществующий товар 404; превышение остатка (с учётом уже лежащего) → 409, ровно по остатку ок; `userId` в теле → 400; цены берутся из товара (после смены цены итог обновляется); удалённый товар → `available: false` и не входит в итог; параллельные добавления дают одну строку.
- orders:
  - Checkout: 201; снапшот `name`, `slug`, `priceCents`, `quantity`; `totalCents` верный; остаток уменьшился; корзина пуста; формат `orderNumber`; клиентские `totalCents`, `priceCents`, `userId`, `status` в теле → 400.
  - Снапшот не меняется после смены цены и имени товара и даже после его удаления.
  - Пустая корзина → 400; товар из корзины удалён → 409 с `reason: 'not_found'`; нехватка остатка → 409 с полным списком позиций, ни один остаток не изменился, заказ не создан, корзина осталась.
  - Откат при частичной нехватке (две позиции, у второй не хватает): остаток первой прежний. Так проверяется, что нигде не забыт `{ session }`.
  - Гонка: остаток 1 и два пользователя оформляют заказ параллельно (`Promise.all`) → ровно один 201 и один 409, `stock === 0`, не отрицательный; остаток 5 и два запроса по 3 → один успех.
  - Доступ: чужой заказ → 404; admin в `GET /orders` видит только свои, чужой → 404; просмотр чужих заказов админом — шаг 8; `GET /orders/all` для customer → 403, без токена → 401; фильтр по `status`, пагинация и границы, новые первыми.
  - Статусы: вся матрица `canTransition` (unit); `PATCH` от customer → 403; допустимый переход → 200; недопустимый (`delivered → pending`) → 409; несуществующий заказ → 404.
  - Отмена возвращает остатки по всем позициям ровно один раз: повторная отмена → 409, остаток не растёт; позиции удалённых товаров пропускаются без ошибки; возврат не затрагивает остатки других товаров.
  - **Откат при отмене:** если возврат остатков падает на одной из позиций (ошибку подставляем в тесте, например подменой метода сервиса товаров на второй позиции), транзакция откатывается целиком: статус заказа остаётся прежним, остатки всех позиций не изменены, ответ 5xx без утечки деталей, повторная отмена после «починки» проходит и возвращает остатки ровно один раз. Так же проверяется, что в операциях отмены нигде не забыт `{ session }`.
- seed: два прогона подряд дают одинаковое число товаров и пользователей (дублей `slug` и email нет); admin имеет роль `admin`, демо-покупатель `customer`, пароли хешируются; повторный запуск не сбрасывает остаток и пароль; `assertSafeSeedTarget` отказывает при `NODE_ENV=production`, при базе без суффикса `-dev`/`-test` и при отсутствии обязательных seed-переменных, разрешает `talkshop-dev`; в текстах ошибок нет URI; при запуске нет сетевых запросов (данные читаются из JSON).
- Swagger: схема безопасности `bearer` есть, у защищённых операций есть `security`, все пути из плана присутствуют в `/api/docs-json`.

**Тестовая инфраструктура:** unit-тесты (`src/**/*.spec.ts`) — чистая логика и сервисы с моками; e2e (`test/*.e2e-spec.ts`) — HTTP через Supertest на реальной Mongo в памяти (`MongoMemoryReplSet`, один экземпляр на прогон, у каждого файла своя база и `syncIndexes()` перед тестами). Первый запуск скачает бинарник `mongod` (порядка 100–300 МБ); на Windows возможен запрос брандмауэра; в CI (этап 8) нужен кеш. Реальный Atlas в тестах не используется.

**Риски:** поиск без морфологии («килим» не найдёт «килими»); роль в токене живёт до часа; Throttler за прокси видит один IP (`trust proxy` — этап 8); забытый `{ session }` в транзакции (и при checkout, и при отмене); бинарник Mongo при первом запуске тестов.

**Откладываем:** оплата, возвраты и отмена покупателем; refresh-токены, подтверждение email, сброс пароля; загрузка изображений (пока только URL); админ-аналитика (этап 6); модули ai и assistant (этапы 3–7); заказы в сиде (этап 5); глобальный exception filter (этап 7); `helmet` (CSP ломает Swagger UI), CORS по списку, `trust proxy`, `npm audit`, `autoIndex` в production (этап 8); Idempotency-Key для checkout.
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

### 2026-11-13 — Этап 0 выполнен
Все шаги 0–10 сделаны: код-ревью всего этапа проведено, `/pre-commit` пройден, разработчик закоммитил и запушил на GitHub (`origin/main`), чекбоксы этапа отмечены. Итог: backend (NestJS 11) подключается к Atlas (dev), отдаёт `GET /api/health` и Swagger на `/api/docs` (вне production); frontend (Vite + React + Tailwind v4) показывает заглушку со статусом API; ESLint и Prettier настроены в обеих частях; тесты backend (Jest) и frontend (Vitest) зелёные. Следующий этап — 1 (Backend-основа), начинаем только после явного «дальше».

**Сделано**
- Шаг 0: `.claude/settings.JSON` → `settings.json`; агенты переименованы (`architect`, `backend-dev`, `frontend-dev`); в `deny` конкретные `.env.*` вместо маски, чтобы `.env.example` читался; `.nvmrc` = `24`.
- Шаг 1 (devops): `.gitignore` (с `!.env.example`), `.editorconfig`, `.gitattributes` (LF), минимальный `README.md`.
- Шаг 2 (backend): Nest CLI 12 сгенерировал Vitest + oxlint + ESM, что не совпадает с CLAUDE.md. По решению разработчика: **Nest 11 + Jest + ESLint, CommonJS** (пакеты Nest 12 ESM-only). TypeScript 6, `strict`, `module`/`moduleResolution: nodenext` без `"type": "module"`. В `tsconfig.build.json` `"incremental": false` (устаревший tsbuildinfo оставлял `dist/` пустым).
- Шаг 3: `@nestjs/config` с валидацией env (`PORT`, `NODE_ENV`, `MONGODB_URI`, `CORS_ORIGIN`; значения в ошибках не печатаются), Mongoose 9 (`forRootAsync`; позже переведён на Mongoose 8.x, см. «Долги»), префикс `api`, `ValidationPipe`, CORS, `GET /api/health` (200 `db: up` / 503 `db: down`, реальный `ping`).
- Шаг 4: Swagger на `/api/docs` (JSON — `/api/docs-json`) только при `NODE_ENV !== 'production'`, e2e-тест (в production 404).
- Шаг 5: ESLint 10 + Prettier в backend, строгие правила (`no-explicit-any`, `no-floating-promises` — error), скрипты `lint`, `lint:fix`, `format`, `format:check`.
- Шаги 6–8: frontend — **Vite 8, React 19, TypeScript 6, Tailwind v4** (токены в `@theme` в `src/index.css`, см. DESIGN.md, раздел 11), **Vitest** + Testing Library, ESLint + Prettier; заглушка со статусом API, `VITE_API_URL`; `.env.example` в `backend/` и `frontend/`.
- **Запрет остановки процессов по имени:** в `.claude/settings.json` (`deny`) добавлены `taskkill /IM` и варианты, `pkill`, `killall`; в `CLAUDE.md` правило «останавливать только по PID». Поводом стала попытка агента выполнить `taskkill /IM node.exe`.
- **Код-ревью всего этапа проведено.** Исправлено в этой чистке: README (корень, backend, frontend), `backend/AGENTS.md` (был сгенерирован Nest CLI 12 и описывал ESM/Vitest), ссылки на `tailwind.config` в `frontend-dev.md` и `react-feature`, шаги проверок в `pre-commit` (`format:check`, без `--if-present`), название в Swagger, чистка пакетов, контраст в UI, тесты на env, права в `.claude/settings.json` (по решению разработчика). Всё, кроме документации, делали другие агенты.

**Решения разработчика**
- Tailwind v4; Vitest во frontend; только npm; `.env.example` по файлу в каждой части; проект не в OneDrive; origin на GitHub настроен; кластер Atlas создан разработчиком, health на реальной базе проверен.
- Nest 11 выбран сознательно; миграция на Nest 12 / TypeScript 7 — отдельное решение позже.

**Осталось**
- По этапу 0 ничего. Перенесённое в «Долги» ниже закрывается на этапах 1, 2, 7 и 8.
- Prettier не запускать по всему проекту без проверки: он переформатирует `backend/test/jest-e2e.json` (скрипты `format` уже ограничены `src` и `test/**/*.ts`).

### Долги
- `autoIndex` в production выключить и вместо него явно вызывать `syncIndexes`/`createIndexes` перед деплоем: уникальность `orderNumber`, `slug`, `email` держится только на индексах — этап 8.
- Индекс под `GET /orders/all` без фильтра по статусу (`{ createdAt: -1, _id: -1 }`) или обязательный фильтр `status` у админа — шаг 8.
- Рефакторинг `OrdersService.placeOrder` (~95 строк): вынести `reserveLines(cartItems, session)`; удобно сделать на шаге 8 вместе с возвратом остатков при отмене.
- Unit-тесты `cart.service` на ветки retry, E11000 и BUSY (через e2e их не воспроизвести, нужен мок `cartModel`) — шаг 11.
- Роль берётся из JWT без проверки в БД на маршрутах без `@Roles` (корзина, свои заказы): после понижения роли или удаления пользователя токен действует до 1 часа, вред ограничен данными самого пользователя. Для admin-маршрутов роль проверяется в БД (`RolesGuard`, шаг 8-pre).
- Text-поиск без морфологии (`tablecloth` не находит `Tablecloths`) — решить к AI-этапу.
- CORS по списку доменов вместо одного origin — этап 8.
- `npm audit`: 10 moderate во frontend (цепочка eslint) и предупреждения в backend — этап 8.
- Решение по языку интерфейса (uk/en) — до этапа 2.
- mongoose 8.x (`^8.24.9`, драйвер mongodb 6.20) вместо 9 из-за бага драйвера mongodb >=7.6 в Jest (NODE-7832: динамический `import('os')` в CommonJS-Jest даёт пустые метаданные handshake и ошибку «Missing required sub-document 'driver'»). Пин `mongoose@9.9.0` не подошёл: `npm audit` показывает для mongoose 9.0.0–9.11.3 критическую уязвимость (sanitizeFilter, prototype pollution). Вернуться на mongoose 9 (последнюю безопасную версию) после выхода исправления драйвера.
- TanStack Query вместо `useState` + `fetch` в `useApiHealth` — этап 2.
- helmet — этап 8.
- Явный `"strict": true` и `"engines"` в `package.json` обеих частей — nice to have.
- В `CLAUDE.md` пометить `docs/`, `.mcp.json`, `backend/evals/` как запланированные (их ещё нет); `CLAUDE.md` не правили, только фиксируем.
