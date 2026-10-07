"""Port of frontend/src/domain/changes.ts: which pairs happen on a date, which rooms and teachers are free."""
from datetime import date

from .indexes import DatasetIndex
from .slots import day_index_of, in_week, parities_overlap, slot_key, week_parity_of


def in_reduced_session(ds: dict, d: str) -> bool:
    sessions = ds["settings"].get("reducedSessions") or []
    return not sessions or any(s["start"] <= d <= s["end"] for s in sessions)


def lessons_on_date(ds: dict, lessons: list[dict], d: str, idx: DatasetIndex | None = None) -> list[dict]:
    """Pairs on a date: right weekday, right week (with parity on), and for reduced-attendance groups only inside a session."""
    idx = idx or DatasetIndex(ds)
    dt = date.fromisoformat(d)
    day = day_index_of(dt)
    if day >= ds["settings"]["workingDays"]:
        return []
    week = week_parity_of(dt) if ds["settings"]["weekParity"] else "weekly"
    session_day = in_reduced_session(ds, d)
    out = []
    for l in lessons:
        if l.get("date"):
            if l["date"] == d:
                out.append(l)
            continue
        if l["day"] != day or not in_week(l, week):
            continue
        if session_day:
            out.append(l)
            continue
        a = idx.assignment_of(l)
        if not a or not any(idx.groups.get(g, {}).get("studyForm") == "reduced" for g, _ in idx.cohorts(a["audience"])):
            out.append(l)
    return out


def lesson_of_change(ds: dict, lessons: list[dict], change: dict) -> dict | None:
    for l in lessons_on_date(ds, lessons, change["date"]):
        if l["assignmentId"] == change["assignmentId"] and l["slot"] == change["slot"]:
            return l
    return None


def _effective(idx: DatasetIndex, lesson: dict, changes: list[dict]) -> tuple[str, str | None]:
    mine = [c for c in changes if c["assignmentId"] == lesson["assignmentId"] and c["slot"] == lesson["slot"]]
    room = next((c.get("roomId") for c in mine if c["kind"] == "room" and c.get("roomId")), lesson["roomId"])
    teacher = next((c.get("teacherId") for c in mine if c["kind"] == "teacher" and c.get("teacherId")), None)
    if teacher is None:
        a = idx.assignment_of(lesson)
        teacher = a["teacherId"] if a else None
    return room, teacher


def free_rooms_for(ds: dict, idx: DatasetIndex, lessons: list[dict], changes: list[dict], d: str, lesson: dict) -> list[dict]:
    """Rooms that fit the pair and are free at its slot on that date, smallest first."""
    a = idx.assignment_of(lesson)
    if not a:
        return []
    same_day = [c for c in changes if c["date"] == d]
    others = [
        l
        for l in lessons_on_date(ds, lessons, d, idx)
        if l["id"] != lesson["id"] and l["slot"] == lesson["slot"] and parities_overlap(l["parity"], lesson["parity"])
    ]
    busy = {_effective(idx, l, same_day)[0] for l in others}
    size = idx.audience_size(a["audience"])
    rooms = [
        r
        for r in ds["rooms"]
        if r["id"] != lesson["roomId"] and r["id"] not in busy and r["capacity"] >= size and idx.room_fits(a, r) and idx.has_equipment(a, r)
    ]
    return sorted(rooms, key=lambda r: r["capacity"])


def free_teachers_for(ds: dict, idx: DatasetIndex, lessons: list[dict], changes: list[dict], d: str, lesson: dict) -> list[dict]:
    """Teachers who could take the pair: not teaching then and not unavailable. Those who teach the activity come first."""
    a = idx.assignment_of(lesson)
    if not a:
        return []
    same_day = [c for c in changes if c["date"] == d]
    others = [l for l in lessons_on_date(ds, lessons, d, idx) if l["id"] != lesson["id"] and l["slot"] == lesson["slot"]]
    busy = {_effective(idx, l, same_day)[1] for l in others}
    key = slot_key(lesson["day"], lesson["slot"])
    ts = [t for t in ds["teachers"] if t["id"] != a["teacherId"] and t["id"] not in busy and key not in t["unavailable"]]
    return sorted(ts, key=lambda t: (not (a["type"] in t["activityTypes"]), t["name"]))
