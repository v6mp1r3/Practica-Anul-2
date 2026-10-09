"""Public reads every page makes at start (the dataset, the published timetable, the schedule changes and the
published exams) answered from memory. Any change saved through this server clears them all at once and they
are read again right away in the background; changes made elsewhere (a teammate's server on the same
database) are picked up when a copy is older than `dataset_cache_seconds`: that request still gets the old
copy at once, the next one the new."""
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable

from .config import get_config

_lock = threading.Lock()
_version = 0
_all: list["Memo"] = []
_reader = ThreadPoolExecutor(max_workers=4, thread_name_prefix="memo")


class Memo:
    def __init__(self, load: Callable[[], Any]):
        self.load = load
        self.cache: tuple[int, float, Any] | None = None  # version it was read at, when, the value
        self.reading: tuple[int, Future] | None = None
        _all.append(self)

    def _start(self, version: int) -> Future:
        """One read per version at a time; the result is kept if nothing was saved meanwhile."""

        def read():
            value = self.load()
            with _lock:
                if _version == version:
                    self.cache = (version, time.monotonic(), value)
            return value

        with _lock:
            if self.reading and self.reading[0] == version and not self.reading[1].done():
                return self.reading[1]
            future = _reader.submit(read)
            self.reading = (version, future)
            return future

    def get(self) -> Any:
        ttl = get_config().dataset_cache_seconds
        if ttl <= 0:
            return self.load()
        with _lock:
            version, cached = _version, self.cache
        if cached and cached[0] == version:
            if time.monotonic() - cached[1] >= ttl:
                self._start(version)
            return cached[2]
        return self._start(version).result()


def forget_all() -> None:
    """Something was saved: every copy is stale; read them again already, so the next request waits less."""
    global _version
    with _lock:
        _version += 1
        version = _version
        for m in _all:
            m.cache = None
    if get_config().dataset_cache_seconds > 0:
        for m in _all:
            m._start(version)
