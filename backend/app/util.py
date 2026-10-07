"""Small conversions between database values and the JSON the frontend expects."""
from datetime import date, datetime, time, timezone

from .errors import ApiError


def sid(value) -> str | None:
    """Database id -> API id (a string)."""
    return None if value is None else str(value)


def pid(value, what: str = "id") -> int:
    """API id -> database id. Anything that is not a whole number cannot exist, so it is a 404."""
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ApiError(404, "Not found")


def maybe_pid(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def hhmm(t: time | None) -> str | None:
    return None if t is None else t.strftime("%H:%M")


def iso_date(d: date | None) -> str | None:
    return None if d is None else d.isoformat()


def iso_ts(ts: datetime | None) -> str | None:
    """2026-10-02T10:00:00.000Z, like JavaScript's toISOString()."""
    if ts is None:
        return None
    return ts.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_date(value: str, what: str = "date") -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ApiError(422, f"Invalid {what}: {value!r}")


def parse_time(value: str, what: str = "time") -> time:
    try:
        return time.fromisoformat(value)
    except (TypeError, ValueError):
        raise ApiError(422, f"Invalid {what}: {value!r}")
