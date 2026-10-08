# Render Free: обновление существующего QueueFlow

Blueprint `queueflow`, web service `queueflow-mai` и PostgreSQL `queueflow-db` уже созданы. **Не создавайте новый Blueprint или базу для обновления.**

1. Опубликовать проверенный коммит ветки `main` в `Armani853/queueflow-mai`. В GitHub не должны попасть `.env`, `*.db`, `.venv`, `node_modules`, `dist` и Playwright artifacts.
2. Открыть существующий **Web Service → queueflow-mai → Deploys**. При включённом Auto-Deploy новый коммит запустит сборку сам. Если сборка не началась, выбрать **Manual Deploy → Deploy latest commit** в web service. Дождаться статуса **Live** и сверить SHA коммита. **Blueprint → Manual sync** нужен для изменений `render.yaml`, а не как основной способ выложить новый код.
3. Существующий `DATABASE_URL` не менять. `render.yaml` берёт connection string из `queueflow-db`; production variables: `ENVIRONMENT=production`, `DEBUG=false`, `TIMEZONE=Europe/Moscow`, `CORS_ORIGINS` пустой для same-origin.
4. Docker build выполняет `npm ci`, `npm run build`, устанавливает Python dependencies. При старте выполняется `alembic upgrade head`, затем запускается Uvicorn.
5. Проверить `https://queueflow-mai.onrender.com/api/health`: `status=ok`, `database=ok`. Затем проверить `/`, прямой refresh `/q/<token>` и `/manage/<token>`, CSV, QR и запись студента. Запустить `python pilot_check.py https://queueflow-mai.onrender.com` и убедиться, что тестовая очередь удалена.
6. Если deploy неудачен: в Render открыть логи сборки/старта, не менять БД; для отката выбрать предыдущий успешный commit в Deploys и повторно развернуть его.

Для Free PostgreSQL записать в заметках дату создания БД, если это ещё не сделано:

- created: `YYYY-MM-DD`;
- expires approximately: `YYYY-MM-DD + 30 дней`.

Free PostgreSQL предназначен только для короткого пилота: перед expiry скачать CSV/сделать экспорт. Он не является бессрочным хранилищем.
