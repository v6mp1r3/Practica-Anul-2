"""Failed logins are counted per account: too many in a short time and the account answers 429 for a while.
It lives in the memory of one server process (fine for one process; behind several workers each counts alone)."""
import threading
import time
from collections import defaultdict, deque

from .errors import ApiError

MAX_FAILURES = 8
WINDOW_SECONDS = 600

_failures: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def _recent(key: str, now: float) -> deque:
    q = _failures[key]
    while q and now - q[0] > WINDOW_SECONDS:
        q.popleft()
    return q


def check(key: str) -> None:
    """Refuse the attempt if this account has failed too often lately."""
    now = time.monotonic()
    with _lock:
        q = _recent(key, now)
        if len(q) >= MAX_FAILURES:
            wait = int(WINDOW_SECONDS - (now - q[0])) + 1
            raise ApiError(429, f"Too many failed sign-ins. Try again in {max(1, wait // 60)} minute(s).")


def failed(key: str) -> None:
    now = time.monotonic()
    with _lock:
        _recent(key, now).append(now)


def succeeded(key: str) -> None:
    with _lock:
        _failures.pop(key, None)


def reset_all() -> None:
    with _lock:
        _failures.clear()
