from contextlib import contextmanager
from types import SimpleNamespace

from sqlalchemy.exc import OperationalError

from app.wait_for_database import wait_for_database


def unavailable(sqlstate=None):
    return OperationalError("connect", {}, SimpleNamespace(sqlstate=sqlstate))


def test_temporary_failure_recovers_without_repeating_migrations():
    calls = 0
    delays = []

    @contextmanager
    def connect():
        nonlocal calls
        calls += 1
        if calls < 3:
            raise unavailable()
        yield SimpleNamespace(execute=lambda _statement: None)

    assert wait_for_database(connect, delays.append) is True
    assert calls == 3
    assert delays == [2, 4]


def test_permanent_dns_failure_stops_after_bounded_retries():
    calls = 0
    delays = []

    def connect():
        nonlocal calls
        calls += 1
        raise unavailable()

    assert wait_for_database(connect, delays.append) is False
    assert calls == 5
    assert delays == [2, 4, 8, 16]


def test_bad_credentials_fail_without_retry():
    delays = []

    def connect():
        raise unavailable("28P01")

    assert wait_for_database(connect, delays.append) is False
    assert delays == []
