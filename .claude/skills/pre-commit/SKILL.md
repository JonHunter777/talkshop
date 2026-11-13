---
name: pre-commit
description: Run the full pre-commit check before committing — git status/diff, lint/build/test for backend and frontend, scan for secrets, console.log, any, ts-ignore and .only, a code-reviewer pass, then propose a Conventional Commits message. Never commits by itself. Use when the user says "проверь перед коммитом", "pre-commit", "можно коммитить?".
disable-model-invocation: true
---

# Проверка перед коммитом

Цель: убедиться, что изменения можно безопасно закоммитить, и подготовить сообщение коммита.
**Коммит делает разработчик сам.** Этот скилл ничего не коммитит и не пушит.

---

## Шаг 1. Что изменилось

```bash
git status
git diff --stat
git diff
git diff --staged
```

- Определи, какие части затронуты: `backend/`, `frontend/`, `backend/src/ai/`, конфиги, документация.
- Если изменений нет — сообщи и остановись.
- Если изменения смешаны из разных задач (например, новая фича + несвязанный рефакторинг) —
  предложи разбить на несколько коммитов.

---

## Шаг 2. Автоматические проверки

Запускай только для затронутых частей:

```bash
# если изменён backend/
cd backend && npm run lint && npm run build && npm run test && npm run format:check

# если изменён frontend/
cd frontend && npm run lint && npm run build && npm run test && npm run format:check
```

Если упало — **дальше не идти**. Покажи ошибку и что, скорее всего, её вызвало.

---

## Шаг 3. Поиск опасного и лишнего

Ищи **только в изменённых строках** (`git diff`):

| Что ищем | Уровень |
|---|---|
| ключи и секреты: `sk-ant`, `mongodb+srv://` с паролем, `password =`, `secret =`, токены | 🔴 стоп |
| файлы `.env` (не `.env.example`) в изменениях | 🔴 стоп |
| `userId` из `body`/`query`/аргументов модели | 🔴 стоп |
| `.only(` в тестах | 🔴 стоп |
| `dangerouslySetInnerHTML` | 🟡 проверить |
| `any`, `// @ts-ignore`, `// eslint-disable` | 🟡 проверить |
| `console.log`, `debugger` | 🟡 убрать |
| `.skip(` в тестах | 🟡 объяснить |
| новая переменная окружения без записи в `.env.example` | 🟡 |
| закомментированный код, `TODO` без пояснения | 🟢 |
| новые зависимости в `package.json` | 🟢 упомянуть |

Найденный секрет **не выводи целиком** — только файл, строку и первые 4–6 символов.

---

## Шаг 4. Ревью

- Если изменения больше пары строк — вызови агента `code-reviewer` для текущего diff.
- Если затронуты `auth/`, `orders/`, `ai/`, `assistant/` — предложи также `security-auditor`.
- Если изменены промпты в `src/ai/prompts/` — проверь, что версия промпта поднята,
  и напомни про evals (`eval-runner`).

---

## Шаг 5. Сообщение коммита

Формат **Conventional Commits** (на английском, коротко):

```
<type>(<scope>): <что сделано>

- деталь 1
- деталь 2
```

- `type`: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`
- `scope`: `products`, `cart`, `orders`, `auth`, `ai`, `assistant`, `catalog`, `ui`, `ci`…
- Первая строка ≤ 72 символов, в повелительном наклонении: `add`, `fix`, `update`.

Примеры:
```
feat(ai): add searchProducts tool for shopping agent
fix(cart): prevent negative quantity on update
test(orders): cover access to another user's order
```

Если нужно разбить изменения — предложи несколько сообщений и какие файлы в какой коммит.

---

## Отчёт (на русском)

```
## Итог
✅ Можно коммитить / ⚠️ Можно после правок / ❌ Нельзя

## Проверки
backend: lint ✅ · build ✅ · test ✅ (42 passed)
frontend: lint ✅ · build ✅

## Найдено
🔴 ...
🟡 ...

## Ревью
Кратко итог code-reviewer.

## Сообщение коммита
feat(...): ...

## Команды
git add <файлы>
git commit -m "..."
```

---

## Чего НЕ делать
- Не выполнять `git add`, `git commit`, `git push` — только предложить команды.
- Не исправлять код молча. Мелкие правки (убрать `console.log`) — только если разработчик попросит.
- Не отключать проверки, чтобы получить ✅.
