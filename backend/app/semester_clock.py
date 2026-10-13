"""The current semester follows the calendar, a break ahead of the classes: spring becomes current on
the first day of the winter break, and the next autumn on the first day of the summer break. So the
faculties build the next timetable during the break. Each switch keeps the settings, like
`python -m app.cli new-semester` (which still works for anything else). The breaks are UTM's rules
(frontend/src/domain/holidays.ts, autoHolidays), moved where an administrator moved them."""
import datetime as dt
import logging

from sqlalchemy import Connection, text

from .config import get_config
from .db import get_engine

log = logging.getLogger("eduschedule")

_checked_on: dt.date | None = None


def _break_start(overrides: dict, key: str, default: dt.date) -> dt.date:
    o = overrides.get(key)
    return dt.date.fromisoformat(o["start"]) if o and o.get("start") else default


def winter_break_start(year: int, overrides: dict) -> dt.date:
    """The Monday of the week of 28 December (academic year `year`/`year+1`)."""
    d = dt.date(year, 12, 28)
    return _break_start(overrides, f"{year}:winter", d - dt.timedelta(days=d.weekday()))


def summer_break_start(year: int, overrides: dict) -> dt.date:
    """1 July of `year + 1` (the end of academic year `year`/`year+1`)."""
    return _break_start(overrides, f"{year}:summer", dt.date(year + 1, 7, 1))


def due_semester(today: dt.date, overrides: dict | None = None) -> str:
    """The semester that should be current on `today`."""
    o = overrides or {}
    y = today.year
    if today >= winter_break_start(y, o):
        return f"Primăvara {y}/{y + 1}"
    if today >= summer_break_start(y - 1, o):
        return f"Toamna {y}/{y + 1}"
    if today >= winter_break_start(y - 1, o):
        return f"Primăvara {y - 1}/{y}"
    return f"Toamna {y - 1}/{y}"


def _order(label: str) -> tuple[int, int]:
    season, years = label.split(" ", 1)
    return int(years.split("/")[0]), 0 if season == "Toamna" else 1


def _overrides(conn: Connection) -> dict:
    rows = conn.execute(
        text(
            "select o.holiday_key, o.start_date from holiday_override o join semester s on s.id = o.semester_id "
            "where s.is_current and o.cycle = 'licenta'"
        )
    ).all()
    return {k: ({"start": d.isoformat()} if d else None) for k, d in rows}


def advance(today: dt.date | None = None) -> str | None:
    """Make the due semester current if the current one is older. Returns the new label, or None."""
    from .memo import forget_all
    from .settings_io import read_settings, save_settings

    today = today or dt.date.today()
    with get_engine().begin() as conn:
        # one at a time (the row lock), and only forward: a semester started ahead on the server stays
        current = conn.execute(text("select label from semester where is_current for update")).scalar()
        if current is None:
            return None
        due = due_semester(today, _overrides(conn))
        if _order(due) <= _order(current):
            return None
        save_settings(conn, {**read_settings(conn), "semester": due})
    log.info("The current semester is now %s (was %s)", due, current)
    forget_all()
    return due


def check_daily() -> None:
    """At most once a day per process: switch the semester if the calendar says so."""
    global _checked_on
    today = dt.date.today()
    if _checked_on == today or not get_config().auto_semester:
        return
    _checked_on = today
    try:
        advance(today)
    except Exception:
        log.warning("Could not check the semester", exc_info=True)
