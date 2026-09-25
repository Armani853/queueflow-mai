import logging
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import BASE_DIR, settings
from app.database import get_db
from app.routers import bookings, manage, sessions


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("queueflow")

app = FastAPI(
    title="QueueFlow MAI API",
    description="API динамической очереди на сдачу лабораторных работ",
    version="1.0.0",
    debug=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(sessions.router)
app.include_router(bookings.router)
app.include_router(manage.router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    message = first.get("msg", "Проверьте введённые данные")
    if message.startswith("Value error, "):
        message = message.removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"detail": message})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error method=%s path=%s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Ошибка сервера. Обновите страницу и попробуйте ещё раз."},
    )


@app.get("/api/health", tags=["system"])
def health(db: Session = Depends(get_db)) -> JSONResponse:
    try:
        db.execute(text("SELECT 1"))
        return JSONResponse({"status": "ok", "service": settings.app_name, "database": "ok"})
    except SQLAlchemyError:
        logger.exception("Database health check failed")
        return JSONResponse(
            status_code=503,
            content={"status": "error", "service": settings.app_name, "database": "unavailable"},
        )


frontend_dist = BASE_DIR / "frontend" / "dist"


@app.get("/{path:path}", include_in_schema=False, response_model=None)
def serve_frontend(path: str) -> Response:
    if not frontend_dist.exists():
        return JSONResponse(
            status_code=404,
            content={"detail": "Frontend не собран. Запустите Vite на http://localhost:5173"},
        )
    requested = (frontend_dist / path).resolve()
    if path and requested.is_file() and frontend_dist.resolve() in requested.parents:
        return FileResponse(requested)
    return FileResponse(frontend_dist / "index.html")
