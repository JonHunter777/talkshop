---
name: nest-module
description: Scaffold a new NestJS module in backend/src following project conventions — module, controller, service, Mongoose schema, DTOs (create/update/query), Swagger, guards, pagination and unit tests — then register it in AppModule and verify lint/build/test. Use when the user or backend-dev needs a new backend module or entity (e.g. "create the orders module").
argument-hint: <module-name> [entity-name]
---

# Новый модуль NestJS

Аргументы: `$ARGUMENTS` — имя модуля во множественном числе (`orders`) и, по желанию,
имя сущности в единственном (`order`). Если сущность не указана — получи её из имени модуля.

Пример: `/nest-module orders order`

---

## Шаг 0. Подготовка (не пропускать)

1. Прочитай `CLAUDE.md` и план `architect` для этого модуля (если есть).
2. Открой **один уже готовый модуль** (например, `backend/src/products/`) и повторяй его стиль.
3. Проверь, что модуля ещё нет: `backend/src/<module>/`.
4. Уточни у разработчика, если не ясно из плана:
   - поля сущности (имя, тип, обязательность);
   - кто имеет доступ: публично / залогиненный пользователь / только владелец / админ;
   - нужны ли все CRUD-операции или только часть.

Не начинай создавать файлы, пока поля и права доступа не понятны.

---

## Шаг 1. Структура

```
backend/src/<module>/
├── <module>.module.ts
├── <module>.controller.ts
├── <module>.service.ts
├── <module>.service.spec.ts
├── schemas/<entity>.schema.ts
└── dto/
    ├── create-<entity>.dto.ts
    ├── update-<entity>.dto.ts
    └── query-<entity>.dto.ts
```

---

## Шаг 2. Schema

- `@Schema({ timestamps: true })` + `SchemaFactory.createForClass`.
- Экспортируй тип документа: `export type <Entity>Document = HydratedDocument<<Entity>>`.
- Деньги — `priceCents: number` (integer).
- Связь с пользователем — `userId: Types.ObjectId` с `ref: 'User'` и `index: true`, если ресурс личный.
- Enum-поля — через `enum` в `@Prop`.
- Индексы под реальные запросы — с комментарием, какой запрос ускоряют. Сложные индексы — к `db-specialist`.

## Шаг 3. DTO

- `Create<Entity>Dto` — `class-validator` на каждое поле + `@ApiProperty({ example })`.
- `Update<Entity>Dto extends PartialType(Create<Entity>Dto)` (из `@nestjs/swagger`).
- `Query<Entity>Dto` — `page` (≥1, default 1), `limit` (1–50, default 20), фильтры из плана.
  Числа из query — через `@Type(() => Number)`.
- **Никаких** полей `userId`, `role`, `_id` в Create/Update DTO.

## Шаг 4. Service

- `@InjectModel(<Entity>.name) private readonly model: Model<<Entity>Document>`.
- Методы (только нужные): `create`, `findAll(query)`, `findOne(id)`, `update(id, dto)`, `remove(id)`.
- Для личных ресурсов каждый метод принимает `userId` и **проверяет владельца**
  (`ForbiddenException` или `NotFoundException`, чтобы не раскрывать существование чужого ресурса).
- Списки возвращают `{ items, total, page, limit }`.
- Чтение — `.lean()`.
- Не найдено — `NotFoundException` с понятным сообщением.
- Если методы будут вызываться AI-агентами как tools — возвращай компактные данные (только нужные поля).

## Шаг 5. Controller

- `@ApiTags('<module>')`, `@Controller('<module>')`.
- Только: маршрут → guard → DTO → вызов сервиса → ответ. Никакой логики.
- Личные маршруты — `@UseGuards(JwtAuthGuard)`, `@ApiBearerAuth()`, `@CurrentUser() user`.
- Админские — плюс `RolesGuard`, `@Roles('admin')`.
- ID — через `ParseObjectIdPipe`.
- На каждый маршрут — `@ApiOperation({ summary })` и основные `@ApiResponse`.

## Шаг 6. Module

- `MongooseModule.forFeature([{ name: <Entity>.name, schema: <Entity>Schema }])`.
- `exports: [<Module>Service]`, если сервис нужен другим модулям или AI-tools.
- Зарегистрируй модуль в `app.module.ts`.

## Шаг 7. Тесты (`<module>.service.spec.ts`)

Минимум:
- успешный `create` и `findOne`;
- `findOne` с несуществующим ID → `NotFoundException`;
- для личных ресурсов: доступ к чужому ресурсу → отказ;
- `findAll` возвращает пагинацию.

Модель мокается через `getModelToken(<Entity>.name)`.

## Шаг 8. Проверка

```bash
cd backend
npm run lint
npm run build
npm run test -- <module>
```

Всё должно пройти. Упало — исправь, прежде чем отчитываться.

---

## Отчёт (на русском)

1. Созданные файлы.
2. Таблица эндпоинтов: метод · путь · guard · описание.
3. Как проверить в Swagger (`/api/docs`): какой эндпоинт открыть и что отправить.
4. Результаты lint / build / test.
5. **Что объяснить** — 2–3 пункта (например: зачем `PartialType`, почему проверка владельца в сервисе, а не в контроллере).
