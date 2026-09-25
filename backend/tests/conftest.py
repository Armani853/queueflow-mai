from datetime import date, timedelta
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture()
def db_session():
    test_database_url = os.getenv("TEST_DATABASE_URL")
    if test_database_url:
        if test_database_url.startswith("postgresql://"):
            test_database_url = test_database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        engine = create_engine(test_database_url, pool_pre_ping=True)
    else:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(engine)
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db_session):
    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def session_payload():
    return {
        "title": "Сдача лабораторных",
        "subject": "Численные методы",
        "session_date": (date.today() + timedelta(days=1)).isoformat(),
        "start_time": "12:00",
        "end_time": "14:00",
        "room": "ГУК Б-315",
        "slot_duration_minutes": 10,
        "buffer_minutes": 2,
        "max_students": 8,
    }


@pytest.fixture()
def created(client, session_payload):
    response = client.post("/api/sessions", json=session_payload)
    assert response.status_code == 201, response.text
    return response.json()
