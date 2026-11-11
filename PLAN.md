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