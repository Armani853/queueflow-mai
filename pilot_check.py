"""Non-destructive smoke/load check for a deployed QueueFlow instance."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


def call(base: str, method: str, path: str, payload: dict | None = None) -> tuple[int, object]:
    data = json.dumps(payload).encode() if payload is not None else None
    request = Request(
        base + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read()
            content_type = response.headers.get("Content-Type", "")
            if "json" in content_type:
                return response.status, json.loads(raw)
            return response.status, raw.decode("utf-8-sig", errors="replace")
    except HTTPError as exc:
        raw = exc.read()
        try:
            body: object = json.loads(raw)
        except json.JSONDecodeError:
            body = raw.decode(errors="replace")
        return exc.code, body


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)
    print(f"[OK] {message}")


def booking(base: str, public_token: str, name: str, slot: int) -> tuple[int, object]:
    return call(
        base,
        "POST",
        f"/api/sessions/{public_token}/bookings",
        {
            "student_name": name,
            "group_name": "PILOT-CHECK",
            "lab_name": "Load check",
            "slot_index": slot,
        },
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url", help="Public base URL, for example https://queueflow-mai.onrender.com")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    admin_token = ""

    try:
        for path in ("/", "/docs"):
            code, _ = call(base, "GET", path)
            expect(code == 200, f"GET {path} = 200")
        code, health = call(base, "GET", "/api/health")
        expect(code == 200 and isinstance(health, dict) and health.get("database") == "ok", "health и DB ping работают")

        tomorrow = (datetime.now(ZoneInfo("Europe/Moscow")) + timedelta(days=1)).date().isoformat()
        code, created = call(
            base,
            "POST",
            "/api/sessions",
            {
                "title": f"[PILOT-CHECK] {datetime.now().isoformat(timespec='seconds')}",
                "subject": "Автоматическая проверка",
                "session_date": tomorrow,
                "start_time": "10:00",
                "end_time": "13:00",
                "room": "CHECK",
                "slot_duration_minutes": 10,
                "buffer_minutes": 2,
                "max_students": 12,
            },
        )
        expect(code == 201 and isinstance(created, dict), "временная очередь создана")
        public_token = str(created["public_token"])
        admin_token = str(created["admin_token"])

        with ThreadPoolExecutor(max_workers=5) as pool:
            results = list(pool.map(lambda item: booking(base, public_token, f"Pilot User {item}", item), range(5)))
        expect([code for code, _ in results] == [201] * 5, "5 разных слотов записались параллельно")

        with ThreadPoolExecutor(max_workers=5) as pool:
            race = list(pool.map(lambda item: booking(base, public_token, f"Race User {item}", 7), range(5)))
        race_codes = sorted(code for code, _ in race)
        expect(race_codes == [201, 409, 409, 409, 409], "гонка за один слот: один 201, четыре 409")

        code, public = call(base, "GET", f"/api/sessions/{public_token}")
        expect(code == 200 and isinstance(public, dict) and "admin_token" not in public, "admin token отсутствует в public response")
        positions = [item["position"] for item in public["bookings"]]
        expect(len(positions) == len(set(positions)), "позиции не дублируются")

        first = results[0][1]
        expect(isinstance(first, dict), "booking response валиден")
        code, _ = call(base, "DELETE", f"/api/bookings/{first['booking_token']}")
        expect(code == 200, "отмена записи работает")

        code, csv_body = call(base, "GET", f"/api/manage/{admin_token}/export.csv")
        expect(code == 200 and isinstance(csv_body, str) and "ФИО" in csv_body, "CSV export работает")
        expect(admin_token not in csv_body and public_token not in csv_body, "CSV не содержит секретных токенов")

        code, _ = call(base, "GET", f"/api/manage/{public_token}")
        expect(code == 404, "public token не открывает teacher API")
        print("[PASS] Pilot check completed")
        return 0
    except (RuntimeError, URLError, TimeoutError) as exc:
        print(f"[FAIL] {exc}")
        return 1
    finally:
        if admin_token:
            code, _ = call(base, "DELETE", f"/api/manage/{admin_token}/session")
            print(f"[CLEANUP] temporary session delete = {code}")


if __name__ == "__main__":
    raise SystemExit(main())
