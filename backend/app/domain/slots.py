"""Port of frontend/src/domain/slots.ts, overlap.ts and the helpers of views.ts."""
from datetime import date, timedelta


def slot_key(day: int, slot: int) -> str:
    return f"{day}:{slot}"


def parities_overlap(a: str, b: str) -> bool:
    """Two lessons in the same slot only meet if their week patterns overlap."""
    return a == "weekly" or b == "weekly" or a == b


def parity_weight(parity: str) -> float:
    """A biweekly pair counts as half in the weekly load."""
    return 1.0 if parity == "weekly" else 0.5


def week_parity_of(d: date) -> str:
    """Odd/even week of a date, counted from 1 September of its academic year (week 1 is odd)."""
    start = date(d.year - (1 if d.month < 9 else 0), 9, 1)
    monday = lambda x: x - timedelta(days=x.weekday())
    weeks = (monday(d) - monday(start)).days // 7
    return "odd" if weeks % 2 == 0 else "even"


def day_index_of(d: date) -> int:
    """0 = Monday ... 6 = Sunday."""
    return d.weekday()


def in_week(lesson: dict, week: str) -> bool:
    return week == "weekly" or lesson["parity"] == "weekly" or lesson["parity"] == week


def lessons_overlap(x: dict, y: dict) -> bool:
    """Do two pairs in the same weekday/slot actually meet? A dated pair (reduced attendance) meets a
    weekly pair only if that weekly pair runs in the date's week, and another dated pair only on its date."""
    if x["day"] != y["day"] or x["slot"] != y["slot"]:
        return False
    dx, dy = x.get("date"), y.get("date")
    if dx and dy:
        return dx == dy
    if dx or dy:
        weekly = y if dx else x
        return parities_overlap(weekly["parity"], week_parity_of(date.fromisoformat(dx or dy)))
    return parities_overlap(x["parity"], y["parity"])
