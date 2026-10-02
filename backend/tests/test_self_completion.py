from datetime import datetime

from app.config import settings
from app.routers import bookings as bookings_router


def add_booking(client, created, slot, name):
    response = client.post(
        f"/api/sessions/{created['public_token']}/bookings",
        json={
            "student_name": name,
            "group_name": "М8О-301Б-23",
            "lab_name": "ЛР self-complete",
            "slot_index": slot,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def prepare_queue(client, created, names=("Иван", "Мария", "Арман", "Анна")):
    bookings = [add_booking(client, created, index, name) for index, name in enumerate(names)]
    started = client.patch(
        f"/api/manage/{created['admin_token']}/bookings/{bookings[0]['id']}",
        json={"status": "CURRENT"},
    )
    assert started.status_code == 200
    return bookings


def freeze_completion(monkeypatch, hour=14, minute=7):
    value = datetime(2026, 10, 3, hour, minute, tzinfo=settings.timezone_info)
    monkeypatch.setattr(bookings_router, "server_now", lambda: value)
    return value


def booking_by_name(payload, name):
    return next(item for item in payload["bookings"] if item["student_name"] == name)


def test_current_student_completes_and_next_becomes_current(client, created, monkeypatch):
    bookings = prepare_queue(client, created)
    finished = freeze_completion(monkeypatch)

    response = client.post(f"/api/bookings/{bookings[0]['booking_token']}/complete")

    assert response.status_code == 200
    payload = response.json()
    ivan = booking_by_name(payload, "Иван")
    maria = booking_by_name(payload, "Мария")
    assert ivan["status"] == "PASSED"
    assert ivan["actual_finished_at"].startswith(finished.isoformat()[:19])
    assert maria["status"] == "CURRENT"
    assert payload["current"]["student_name"] == "Мария"


def test_remaining_times_rebase_from_server_finish_and_include_buffer(client, created, monkeypatch):
    bookings = prepare_queue(client, created)
    freeze_completion(monkeypatch, 14, 7)

    payload = client.post(f"/api/bookings/{bookings[0]['booking_token']}/complete").json()

    assert booking_by_name(payload, "Мария")["scheduled_time"] == "14:09:00"
    assert booking_by_name(payload, "Арман")["scheduled_time"] == "14:21:00"
    assert booking_by_name(payload, "Анна")["scheduled_time"] == "14:33:00"


def test_zero_buffer_starts_next_at_actual_finish(client, session_payload, monkeypatch):
    payload = {**session_payload, "buffer_minutes": 0}
    created = client.post("/api/sessions", json=payload).json()
    bookings = prepare_queue(client, created)
    freeze_completion(monkeypatch, 14, 7)

    queue = client.post(f"/api/bookings/{bookings[0]['booking_token']}/complete").json()

    assert [booking_by_name(queue, name)["scheduled_time"] for name in ("Мария", "Арман", "Анна")] == [
        "14:07:00",
        "14:17:00",
        "14:27:00",
    ]


def test_waiting_student_cannot_complete_early(client, created, monkeypatch):
    bookings = prepare_queue(client, created, ("Иван", "Мария"))
    freeze_completion(monkeypatch)

    response = client.post(f"/api/bookings/{bookings[1]['booking_token']}/complete")

    assert response.status_code == 409
    assert "только текущему" in response.json()["detail"]


def test_public_or_random_token_cannot_complete_someone_elses_booking(client, created, monkeypatch):
    bookings = prepare_queue(client, created, ("Иван", "Мария"))
    freeze_completion(monkeypatch)

    response = client.post(f"/api/bookings/{created['public_token']}/complete")

    assert response.status_code == 404
    assert client.get(f"/api/bookings/{bookings[0]['booking_token']}").json()["status"] == "CURRENT"


def test_cancelled_booking_cannot_be_completed(client, created, monkeypatch):
    booking = add_booking(client, created, 0, "Иван")
    assert client.delete(f"/api/bookings/{booking['booking_token']}").status_code == 200
    freeze_completion(monkeypatch)

    response = client.post(f"/api/bookings/{booking['booking_token']}/complete")

    assert response.status_code == 409
    assert "Отменённую" in response.json()["detail"]


def test_current_booking_cannot_be_completed_after_queue_is_closed(client, created, monkeypatch):
    bookings = prepare_queue(client, created, ("Иван", "Мария"))
    closed = client.patch(
        f"/api/manage/{created['admin_token']}/session",
        json={"is_active": False},
    )
    assert closed.status_code == 200
    freeze_completion(monkeypatch)

    response = client.post(f"/api/bookings/{bookings[0]['booking_token']}/complete")

    assert response.status_code == 409
    assert response.json()["detail"] == "Эта очередь закрыта"


def test_repeated_complete_is_idempotent_and_does_not_shift_twice(client, created, monkeypatch):
    bookings = prepare_queue(client, created, ("Иван", "Мария", "Арман"))
    freeze_completion(monkeypatch, 14, 7)
    first = client.post(f"/api/bookings/{bookings[0]['booking_token']}/complete")
    freeze_completion(monkeypatch, 15, 30)

    second = client.post(f"/api/bookings/{bookings[0]['booking_token']}/complete")

    assert first.status_code == second.status_code == 200
    assert booking_by_name(second.json(), "Мария")["scheduled_time"] == "14:09:00"
    assert booking_by_name(second.json(), "Арман")["scheduled_time"] == "14:21:00"


def test_completion_persists_after_reload_and_second_student_can_advance(client, created, monkeypatch):
    bookings = prepare_queue(client, created)
    freeze_completion(monkeypatch, 14, 7)
    assert client.post(f"/api/bookings/{bookings[0]['booking_token']}/complete").status_code == 200

    reloaded = client.get(f"/api/sessions/{created['public_token']}").json()
    assert booking_by_name(reloaded, "Мария")["status"] == "CURRENT"
    assert booking_by_name(reloaded, "Арман")["scheduled_time"] == "14:21:00"

    freeze_completion(monkeypatch, 14, 16)
    advanced = client.post(f"/api/bookings/{bookings[1]['booking_token']}/complete").json()
    assert booking_by_name(advanced, "Мария")["status"] == "PASSED"
    assert booking_by_name(advanced, "Арман")["status"] == "CURRENT"
    assert booking_by_name(advanced, "Арман")["scheduled_time"] == "14:18:00"
    assert booking_by_name(advanced, "Анна")["scheduled_time"] == "14:30:00"
