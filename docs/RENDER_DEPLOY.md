# Render Free deploy

1. Опубликовать текущую ветку `main` в GitHub. В репозиторий не должны попасть `.env`, `*.db`, `.venv`, `node_modules`, `dist` и Playwright artifacts.
2. Render → **New → Blueprint** → выбрать GitHub repository и `render.yaml`.
3. До подтверждения проверить планы: `queueflow-mai` — **Free**, `queueflow-db` — **Free**, persistent disk отсутствует. Если Render предлагает только платный ресурс — остановиться.
4. Blueprint автоматически передаст Internal PostgreSQL connection string через `DATABASE_URL`. Остальные production variables: `ENVIRONMENT=production`, `DEBUG=false`, `TIMEZONE=Europe/Moscow`, `CORS_ORIGINS` пустой для same-origin.
5. Docker build выполняет `npm ci`, `npm run build`, устанавливает Python dependencies. Start выполняет `alembic upgrade head`, затем один Uvicorn process без access-log токенов.
6. После deploy проверить `/`, прямой refresh `/q/<token>` и `/manage/<token>`, `/docs`, `/openapi.json`, `/api/health` (`database=ok`). Затем: `python pilot_check.py https://<service>.onrender.com`.
7. Rollback: Render → Deploys → последний успешный deploy → Redeploy. PostgreSQL не удалять и `DATABASE_URL` не менять.

Записать после создания БД:

- created: `YYYY-MM-DD`;
- expires approximately: `YYYY-MM-DD + 30 дней`.

Free PostgreSQL предназначен только для короткого пилота: перед expiry скачать CSV/сделать экспорт. Он не является бессрочным хранилищем.
