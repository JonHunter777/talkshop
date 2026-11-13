---
name: react-feature
description: Scaffold a new frontend feature in frontend/src/features following project conventions — typed API functions, TanStack Query keys and hooks, components with loading/error/empty states, Tailwind mobile-first layout, accessibility, optional page and route — then verify lint/build. Use when the user or frontend-dev needs a new UI feature (e.g. "add the orders history feature").
argument-hint: <feature-name> [page-name]
---

# Новая фича во frontend

Аргументы: `$ARGUMENTS` — имя фичи (`orders`) и, по желанию, имя страницы (`MyOrdersPage`).

Пример: `/react-feature orders MyOrdersPage`

---

## Шаг 0. Подготовка (не пропускать)

1. Прочитай `DESIGN.md` и используй только его токены (без своих цветов, отступов и шрифтов).
   Затем `CLAUDE.md` и план `architect` для фичи (если есть).
2. Открой **одну уже готовую фичу** (например, `frontend/src/features/catalog/`) и повторяй её стиль.
3. Проверь, что нужные эндпоинты существуют: Swagger (`/api/docs`) или DTO в `backend/src/<module>/dto/`.
   **Если эндпоинта нет — остановись** и скажи, что нужен `backend-dev`. Не делай моков вместо API.
4. Проверь `frontend/src/shared/ui/` — какие компоненты уже есть (Button, Card, Skeleton, Modal…). Переиспользуй.
5. Уточни, если неясно: что видит пользователь, какие действия, нужна ли авторизация, есть ли дизайн.

---

## Шаг 1. Структура

```
frontend/src/features/<feature>/
├── api/
│   ├── <feature>.api.ts       # функции запросов
│   └── keys.ts                # ключи TanStack Query
├── hooks/
│   ├── use<Feature>List.ts
│   └── use<Action><Feature>.ts  # мутации
├── components/
│   ├── <Feature>List.tsx
│   ├── <Feature>Card.tsx
│   └── <Feature>Skeleton.tsx
└── index.ts                   # публичный экспорт фичи
```

Страница (если нужна) — `frontend/src/pages/<PageName>.tsx`.
Типы ответов API — `frontend/src/types/<feature>.ts` (совпадают с DTO на backend).

---

## Шаг 2. Типы

- Опиши типы ответа и входа по DTO backend. Без `any`.
- Цены — `priceCents: number`.
- Список с пагинацией — общий тип `Paginated<T> = { items: T[]; total: number; page: number; limit: number }`.

## Шаг 3. API и ключи

- Запросы — только через `shared/lib/apiClient` (базовый URL и JWT уже там).
- `keys.ts`:
  ```ts
  export const ordersKeys = {
    all: ['orders'] as const,
    list: (params: OrdersQuery) => [...ordersKeys.all, 'list', params] as const,
    detail: (id: string) => [...ordersKeys.all, 'detail', id] as const,
  };
  ```

## Шаг 4. Хуки

- Чтение — `useQuery` с ключом из `keys.ts`.
- Изменение — `useMutation` + `invalidateQueries` нужных ключей в `onSuccess`.
- Хуки возвращают данные и состояния; компоненты не вызывают `apiClient` напрямую.
- Серверные данные **не** копируются в `useState` или Zustand.

## Шаг 5. Компоненты

- Один компонент — один файл, `type Props = {...}`.
- Логика — в хуках, компонент только рисует.
- **Обязательные состояния:**
  - loading → `<Feature>Skeleton`;
  - error → сообщение + кнопка «Повторить» (`refetch`);
  - empty → понятный текст и подсказка/действие;
  - success → данные.
- Цены — через `formatPrice()`.
- Кнопка при мутации — `disabled` и индикатор загрузки.

## Шаг 6. Вёрстка (Tailwind)

- Mobile-first: базовые классы для 360px, затем `md:` и `lg:`.
- Цвета, отступы, радиусы — из токенов: они живут в `@theme` в `frontend/src/index.css`, см. DESIGN.md, раздел 11 (в Tailwind v4 нет `tailwind.config`). Без произвольных `[13px]`.
- Повторяющиеся элементы — в `shared/ui`, а не копипаст классов.

## Шаг 7. Доступность

- Семантика: `button` для действий, `a`/`Link` для переходов, `ul/li` для списков, `form` + `label`.
- `alt` у картинок, `aria-label` у иконок-кнопок.
- Работает с клавиатуры, виден `focus`.

## Шаг 8. Страница и роут (если нужно)

- Страница собирает компоненты фичи, без своей логики запросов.
- Добавь маршрут в `app/router`. Личная страница — через защищённый роут.
- Ссылка в навигации, если указано в плане.

## Шаг 9. Проверка

```bash
cd frontend
npm run lint
npm run build
npm run test   # если есть тесты
```

Если подключён Playwright MCP — открой страницу и сделай скриншоты на **360px** и **1280px**.

---

## Отчёт (на русском)

1. Созданные файлы.
2. Что появилось в UI и по какому адресу.
3. Как проверить: что открыть, что нажать, что должно произойти (включая empty и error).
4. Результаты lint / build, скриншоты.
5. Нужно от других (например, эндпоинт для `backend-dev`).
6. **Что объяснить** — 2–3 пункта (зачем `invalidateQueries`, почему ключи в отдельном файле, почему skeleton лучше спиннера).
