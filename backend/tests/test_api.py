from datetime import date, timedelta

from sqlalchemy import func, select

from app.config import Settings
from app.models import Booking


def book(client, created, slot, name="Арман Саркисян"):
    return client.post(
        f"/api/sessions/{created['public_token']}/bookings",
        json={
            "student_name": name,
            "group_name": "М8О-301Б-23",
            "lab_name": "ЛР 1.3",
            "slot_index": slot,
        },
    )


def test_create_and_read_session(client, session_payload):
    response = client.post("/api/sessions", json=session_payload)
    assert response.status_code == 201
    body = response.json()
    assert body["public_token"] != body["admin_token"]
    public = client.get(f"/api/sessions/{body['public_token']}")
    assert public.status_code == 200
    assert len(public.json()["slots"]) == 8
    assert "admin_token" not in public.json()


def test_create_booking_and_conflict(client, created):
    first = book(client, created, 0)
    assert first.status_code == 201
    assert first.json()["scheduled_time"] == "12:00:00"
    conflict = book(client, created, 0, "Мария Волкова")
    assert conflict.status_code == 409
    assert "заняли" in conflict.json()["detail"]


def test_duplicate_student_rejected(client, created):
    assert book(client, created, 0).status_code == 201
    second = book(client, created, 1)
    assert second.status_code == 409


def test_cancel_compacts_queue(client, created):
    first = book(client, created, 0, "Арман").json()
    second = book(client, created, 1, "Мария").json()
    third = book(client, created, 2, "Давид").json()
    cancelled = client.delete(f"/api/bookings/{second['booking_token']}")
    assert cancelled.status_code == 200
    queue = client.get(f"/api/sessions/{created['public_token']}").json()
    assert [item["student_name"] for item in queue["bookings"]] == ["Арман", "Давид"]
    assert [item["scheduled_time"] for item in queue["bookings"]] == ["12:00:00", "12:12:00"]
    assert first["booking_token"] and third["booking_token"]


def test_status_current_and_passed(client, created):
    first = book(client, created, 0, "Арман").json()
    book(client, created, 1, "Мария")
    current = client.patch(
        f"/api/manage/{created['admin_token']}/bookings/{first['id']}",
        json={"status": "CURRENT"},
    )
    assert current.status_code == 200
    dashboard = client.get(f"/api/manage/{created['admin_token']}").json()
    assert dashboard["current"]["student_name"] == "Арман"
    assert dashboard["next_booking"]["student_name"] == "Мария"
    passed = client.patch(
        f"/api/manage/{created['admin_token']}/bookings/{first['id']}",
        json={"status": "PASSED"},
    )
    assert passed.status_code == 200
    assert passed.json()["status"] == "PASSED"


def test_late_then_move(client, created):
    late_booking = book(client, created, 0, "Арман").json()
    book(client, created, 1, "Мария")
    response = client.patch(
        f"/api/manage/{created['admin_token']}/bookings/{late_booking['id']}",
        json={"status": "LATE"},
    )
    assert response.status_code == 200
    assert response.json()["scheduled_time"] is None
    dashboard = client.get(f"/api/manage/{created['admin_token']}").json()
    assert dashboard["bookings"][-1]["student_name"] == "Арман"
    assert dashboard["bookings"][-1]["status"] == "LATE"
    moved = client.post(
        f"/api/manage/{created['admin_token']}/bookings/{late_booking['id']}/move"
    )
    assert moved.status_code == 200
    assert moved.json()["scheduled_time"] == "12:12:00"


def test_cancelled_cannot_be_moved(client, created):
    booking = book(client, created, 0, "Арман").json()
    cancelled = client.patch(
        f"/api/manage/{created['admin_token']}/bookings/{booking['id']}",
        json={"status": "CANCELLED"},
    )
    assert cancelled.status_code == 200
    moved = client.post(
        f"/api/manage/{created['admin_token']}/bookings/{booking['id']}/move"
    )
    assert moved.status_code == 409
    assert "только для опоздавшего" in moved.json()["detail"]


def test_passed_is_terminal_and_requires_current(client, created):
    booking = book(client, created, 0, "Арман").json()
    direct_pass = client.patch(
        f"/api/manage/{created['admin_token']}/bookings/{booking['id']}",
        json={"status": "PASSED"},
    )
    assert direct_pass.status_code == 409
    assert client.patch(
        f"/api/manage/{created['admin_token']}/bookings/{booking['id']}",
        json={"status": "CURRENT"},
    ).status_code == 200
    assert client.patch(
        f"/api/manage/{created['admin_token']}/bookings/{booking['id']}",
        json={"status": "PASSED"},
    ).status_code == 200
    reopen = client.patch(
        f"/api/manage/{created['admin_token']}/bookings/{booking['id']}",
        json={"status": "CURRENT"},
    )
    assert reopen.status_code == 409
    assert "финальным" in reopen.json()["detail"]


def test_invalid_tokens(client):
    assert client.get("/api/sessions/nope").status_code == 404
    assert client.get("/api/manage/nope").status_code == 404
    assert client.delete("/api/bookings/nope").status_code == 404


def test_validation(client, session_payload):
    invalid = {**session_payload, "start_time": "15:00", "end_time": "14:00"}
    response = client.post("/api/sessions", json=invalid)
    assert response.status_code == 422
    invalid_booking = {"student_name": " ", "group_name": "A", "lab_name": "ЛР", "slot_index": 0}
    created = client.post("/api/sessions", json=session_payload).json()
    assert client.post(f"/api/sessions/{created['public_token']}/bookings", json=invalid_booking).status_code == 422


def test_admin_token_required(client, created):
    booking = book(client, created, 0).json()
    response = client.patch(
        f"/api/manage/{created['public_token']}/bookings/{booking['id']}",
        json={"status": "CURRENT"},
    )
    assert response.status_code == 404


def test_deleted_session_tokens_expire_and_bookings_cascade(client, created, db_session):
    book(client, created, 0)
    response = client.delete(f"/api/manage/{created['admin_token']}/session")
    assert response.status_code == 204
    assert client.get(f"/api/sessions/{created['public_token']}").status_code == 404
    assert client.get(f"/api/manage/{created['admin_token']}").status_code == 404
    assert db_session.scalar(select(func.count()).select_from(Booking)) == 0


def test_update_session_recalculates_buffer(client, created):
    book(client, created, 0, "Арман")
    book(client, created, 1, "Мария")
    response = client.patch(
        f"/api/manage/{created['admin_token']}/session", json={"buffer_minutes": 5}
    )
    assert response.status_code == 200
    assert response.json()["bookings"][1]["scheduled_time"] == "12:15:00"


def test_health_checks_database(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["database"] == "ok"


def test_csv_export_has_fields_and_no_tokens(client, created):
    book(client, created, 0, "Арман")
    response = client.get(f"/api/manage/{created['admin_token']}/export.csv")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "ФИО,Группа,Лабораторная,Время,Статус,Примечание" in response.text
    assert "Арман" in response.text
    assert created["admin_token"] not in response.text
    assert created["public_token"] not in response.text


def test_past_session_is_visible_but_closed_for_booking(client, session_payload):
    payload = {**session_payload, "session_date": (date.today() - timedelta(days=1)).isoformat()}
    created = client.post("/api/sessions", json=payload).json()
    assert client.get(f"/api/sessions/{created['public_token']}").status_code == 200
    response = book(client, created, 0)
    assert response.status_code == 409
    assert "завершено" in response.json()["detail"]


def test_render_postgres_url_uses_psycopg3_driver():
    configured = Settings(database_url="postgresql://user:pass@db/queueflow", _env_file=None)
    assert configured.sqlalchemy_database_url == "postgresql+psycopg://user:pass@db/queueflow"


def test_release_debug_environment_is_safe():
    configured = Settings(debug="release", _env_file=None)
    assert configured.debug is False
