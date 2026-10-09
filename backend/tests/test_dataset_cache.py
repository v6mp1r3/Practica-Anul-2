"""The public start-up reads answer from memory: one database read per change, refreshed in the background."""
import threading
import time

import pytest

from app import memo
from app.memo import Memo

pytestmark = pytest.mark.no_db


calls: list[int] = []


def _fake():
    calls.append(1)
    time.sleep(0.1)
    return {"read": len(calls)}


m = Memo(_fake)


@pytest.fixture
def reads(monkeypatch):
    monkeypatch.setattr(memo.get_config(), "dataset_cache_seconds", 0.4)
    monkeypatch.setattr(memo, "_all", [m])  # only this one, not the real database reads
    memo.forget_all()
    m.reading[1].result()
    calls.clear()
    return calls


def test_answers_from_memory_until_something_is_saved(reads):
    first = m.get()
    assert m.get() is first and reads == []
    memo.forget_all()  # a save: read again, once, however many ask at the same time
    got = []
    threads = [threading.Thread(target=lambda: got.append(m.get())) for _ in range(5)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len(reads) == 1 and all(g is got[0] for g in got) and got[0] is not first


def test_an_old_copy_is_served_while_it_is_refreshed(reads):
    old = m.get()
    time.sleep(0.45)
    started = time.monotonic()
    assert m.get() is old and time.monotonic() - started < 0.05  # no waiting
    m.reading[1].result()
    assert m.get()["read"] == len(reads) and len(reads) == 1


def test_off_reads_every_time(monkeypatch, reads):
    monkeypatch.setattr(memo.get_config(), "dataset_cache_seconds", 0)
    m.get()
    m.get()
    assert len(reads) == 2
