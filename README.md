# QueueFlow MAI

QueueFlow MAI — web-сервис для прозрачной записи на сдачу лабораторных. Преподаватель создаёт окно сдачи и отправляет группе одну публичную ссылку. Студент выбирает свободный слот, вводит ФИО, группу и лабораторную, а преподаватель управляет live-очередью из отдельной секретной панели.

Проект закрывает конкретную проблему: сообщения «я после Пети», «кто следующий?» и ручные переносы в Telegram заменяются актуальным расписанием с автоматическим пересчётом.

![Teacher dashboard](docs/screenshots/teacher-dashboard.png)

## Что реализовано

- создание окна сдачи с датой, интервалом, аудиторией, длительностью слота, буфером и лимитом;
- криптографически случайные public/admin/booking tokens;
- публичная student page и секретная teacher dashboard;
- выбор любого свободного временного слота и подтверждение записи;
- QR-код публичной ссылки;
- live-обновление через polling каждые 2 секунды;
- статусы BOOKED, WAITING, CURRENT, PASSED, CANCELLED и LATE;
- текущий и следующий студент;
- режим COMPACT: отмена или опоздание сдвигает более поздние записи;
- перенос опоздавшего в ближайший свободный слот;
- защита слота транзакцией и уникальным DB constraint, конфликт возвращает HTTP 409;
- SQLite локально и PostgreSQL через `DATABASE_URL`;
- Alembic migration, demo seed, pytest и browser E2E.

## Стек

Frontend: React 18, TypeScript, Vite, React Router, собственная responsive design system, `qrcode.react`.

Backend: Python 3.12, FastAPI, Pydantic, SQLAlchemy 2, Alembic.

QA: pytest, FastAPI TestClient, Playwright с системным Chrome.

## Архитектура

```text
.
├── backend/
│   ├── app/
│   │   ├── models/             # SQLAlchemy entities и constraints
│   │   ├── routers/            # public, booking и management API
│   │   ├── schemas/            # Pydantic request/response models
│   │   ├── services/
│   │   │   └── queue_engine.py # единая логика времени, позиций и сдвига
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── alembic/                # миграции
│   ├── tests/                  # API и Queue Engine tests
│   └── seed_demo.py
├── frontend/
│   ├── e2e/                    # полный demo flow в браузере
│   └── src/
│       ├── api/
│       ├── components/
│       ├── pages/
│       └── types/
├── docs/
│   ├── REQUIREMENTS_SNAPSHOT.md
│   └── DEMO_GUIDE.md
├── Dockerfile
├── docker-compose.yml
└── render.yaml
```

`QueueEngine` — единственное место, где назначаются позиции и время. API endpoints не дублируют правила очереди.

## Локальный запуск

### 1. Backend

PowerShell из корня проекта:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item .env.example .env
Set-Location backend
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Swagger: <http://127.0.0.1:8000/docs>

Health check: <http://127.0.0.1:8000/api/health>

### 2. Frontend

Во втором PowerShell из корня:

```powershell
Set-Location frontend
$env:npm_config_script_shell = "C:\Windows\System32\cmd.exe"
npm install
npm run dev
```

Frontend: <http://localhost:5173>

Vite проксирует `/api` на FastAPI. В этой Windows-среде локальная конфигурация npm указывала на `/bin/bash`, поэтому команда выше задаёт shell только на время текущей PowerShell-сессии.

## Один production-like процесс

После установки зависимостей:

```powershell
Set-Location frontend
$env:npm_config_script_shell = "C:\Windows\System32\cmd.exe"
npm run build
Set-Location ..\backend
..\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000
```

FastAPI раздаст `frontend/dist`, поэтому весь продукт откроется на <http://127.0.0.1:8000>.

### QR для телефона в локальной сети

`localhost` и `127.0.0.1` на телефоне указывают на сам телефон, а не на ноутбук. QueueFlow явно предупреждает об этом рядом с QR и позволяет задать сетевой адрес компьютера.

1. Запустите production-like сервер с `--host 0.0.0.0`.
2. Подключите телефон и ноутбук к одной сети Wi-Fi.
3. Узнайте IPv4 компьютера командой `ipconfig`.
4. В поле «Адрес компьютера для QR» введите, например, `http://192.168.1.42:8000`.
5. Убедитесь, что показанная строка «QR ведёт на» содержит этот адрес, затем сканируйте код.

В production на публичном HTTPS-домене поле не показывается: QR автоматически использует текущий origin.

## Demo data

Сначала примените migration, затем из `backend/`:

```powershell
..\.venv\Scripts\python.exe seed_demo.py
```

Seed создаёт очередь «Демо: сдача лабораторных» по предмету «Численные методы», аудиторию ГУК Б-315 и четырёх студентов:

- Арман Саркисян — ЛР 1.3;
- Мария Волкова — ЛР 1.4;
- Давид Арутюнян — ЛР 1.2;
- Анна Соколова — ЛР 1.5.

Шаг равен 12 минутам: 10 минут сдача + 2 минуты буфер.

## Тесты

Backend и Queue Engine:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest -q
```

Production build:

```powershell
Set-Location frontend
$env:npm_config_script_shell = "C:\Windows\System32\cmd.exe"
npm run build
```

Browser E2E, когда backend уже работает на порту 8000:

```powershell
Set-Location frontend
$env:npm_config_script_shell = "C:\Windows\System32\cmd.exe"
npm run test:e2e
```

E2E создаёт очередь через UI, записывает Армана через student page, добавляет ещё три записи, отменяет Марию, проверяет сдвиг Давида и Анны, меняет CURRENT/PASSED, обновляет страницы и одновременно отправляет два запроса в один слот. Ожидаемый результат гонки: один HTTP 201 и один HTTP 409.

## Переменные окружения

| Переменная | Назначение | Default |
| --- | --- | --- |
| `DATABASE_URL` | SQLAlchemy URL | `sqlite:///./queueflow.db` |
| `FRONTEND_URL` | адрес UI для ссылок/seed | `http://localhost:5173` |
| `CORS_ORIGINS` | разрешённые origins через запятую | localhost Vite |
| `TOKEN_BYTES` | энтропия URL-safe токенов | `24` |
| `ENVIRONMENT` | имя окружения | `development` |
| `TIMEZONE` | часовой пояс бизнес-правил записи | `Europe/Moscow` |

PostgreSQL example:

```text
DATABASE_URL=postgresql+psycopg://queueflow:password@host:5432/queueflow
```

Секреты не коммитятся. `.env` добавлен в `.gitignore`.

## Deployment

### Docker

```powershell
docker compose up --build
```

Контейнер собирает React, применяет Alembic migration и запускает FastAPI на порту 8000.

### Render

1. Создайте новый Blueprint из этого репозитория: `render.yaml` создаст web service и PostgreSQL.
2. Запустите deploy. Docker startup автоматически выполняет `alembic upgrade head`.
3. Проверьте `/`, `/api/health` и `/docs`, затем выполните `python pilot_check.py https://<service>.onrender.com`.

Для локального fallback одной командой используйте `powershell -ExecutionPolicy Bypass -File .\start_local_pilot.ps1`. Практический чек-лист пилота: `docs/PILOT_TOMORROW.md`.

Аккаунт Render и публикация во внешний интернет требуют действий владельца, поэтому из локальной среды deploy не выполнялся.

## Безопасность

- public token не разрешает teacher actions;
- admin token не показывается на student page;
- booking token позволяет отменить только конкретную запись;
- все пользовательские поля валидируются Pydantic и DB constraints;
- ORM параметризует SQL;
- React экранирует пользовательский текст;
- CORS ограничивается явным списком;
- токены генерируются `secrets.token_urlsafe`;
- активный слот защищён уникальным constraint `(session_id, slot_index)`.

## Семантика статусов

| Статус | Значение | Поведение в расписании |
| --- | --- | --- |
| `BOOKED` | подтверждённая будущая запись | занимает слот |
| `WAITING` | студент ожидает после ручного переноса | занимает слот |
| `CURRENT` | студент сдаёт сейчас | занимает слот, только один CURRENT |
| `PASSED` | сдача завершена | финальный статус, история сохраняется |
| `CANCELLED` | запись отменена | финальный статус, скрывается из очереди, следующие сдвигаются |
| `LATE` | студент временно выбыл из расписания | остаётся видимым преподавателю без времени; «Перенести» возвращает в ближайший слот |

`CANCELLED` нельзя вернуть через перенос. `PASSED` нельзя снова сделать CURRENT. Переход в `PASSED` разрешён только из `CURRENT`.

## Emergency recovery перед защитой

Если backend не стартует, запускайте без активации venv:

```powershell
cd "C:\University\Year 3\Semester 5\IT Development\backend"
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Если SQLite повреждена и demo-данные можно пересоздать, сначала сохраните её как резервную копию:

```powershell
cd "C:\University\Year 3\Semester 5\IT Development\backend"
Move-Item -LiteralPath .\queueflow.db -Destination .\queueflow.broken.db
..\.venv\Scripts\alembic.exe upgrade head
..\.venv\Scripts\python.exe seed_demo.py
```

Если порт 8000 занят:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object OwningProcess
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8010
```

После смены порта откройте `http://127.0.0.1:8010`. Для полностью автономного резерва заранее сохраните открытыми screenshot dashboard и Swagger schema, но основной показ проводите на живом приложении.

## Известные ограничения MVP

- live-режим использует polling, а не WebSocket/SSE;
- нет MAI SSO, журналов оценок и сложных ролей;
- student cancellation работает на устройстве, где сохранён booking token;
- время трактуется в локальном часовом поясе сервера/пользователя;
- Telegram bot и reminders оставлены после P0/P1;
- KEEP_TIME описан моделью, но UI использует демонстрационный default COMPACT.

## Материалы

- [Requirements Snapshot](docs/REQUIREMENTS_SNAPSHOT.md)
- [Сценарий показа и ответы преподавателю](docs/DEMO_GUIDE.md)
- [Swagger](http://127.0.0.1:8000/docs)
