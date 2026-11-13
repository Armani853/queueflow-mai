"""Bounded database readiness check before Alembic and the web server start."""

import logging
import time
from collections.abc import Callable

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.database import engine


logger = logging.getLogger("queueflow.startup")
RETRY_DELAYS = (2, 4, 8, 16)
PERMANENT_SQLSTATES = {"28000", "28P01", "3D000"}


def wait_for_database(
    connect: Callable = engine.connect,
    sleep: Callable[[int], None] = time.sleep,
) -> bool:
    for attempt in range(len(RETRY_DELAYS) + 1):
        try:
            with connect() as connection:
                connection.execute(text("SELECT 1"))
            logger.info("Database connection ready")
            return True
        except OperationalError as exc:
            sqlstate = getattr(exc.orig, "sqlstate", None)
            if sqlstate in PERMANENT_SQLSTATES:
                logger.error("Database authentication or database name is invalid (SQLSTATE %s)", sqlstate)
                return False
            if attempt == len(RETRY_DELAYS):
                logger.error("Database remains unavailable after %s attempts; startup stopped", attempt + 1)
                return False
            delay = RETRY_DELAYS[attempt]
            logger.warning("Database unavailable (attempt %s/%s); retrying in %ss", attempt + 1, len(RETRY_DELAYS) + 1, delay)
            sleep(delay)
    return False


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    raise SystemExit(0 if wait_for_database() else 1)
