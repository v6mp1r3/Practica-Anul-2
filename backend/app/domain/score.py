"""Port of frontend/src/domain/score.ts: soft constraints turned into a weighted penalty."""
from collections import defaultdict

from .indexes import DatasetIndex
from .slots import in_week, parity_weight
from .validator import find_hard_conflicts

SOFT_WEIGHTS = {
    "teacherGaps": 3,
    "groupGaps": 12,  # students should have no gaps: the heaviest comfort rule
    "earlyStarts": 1,
    "dayOverload": 5,
    "unevenDays": 1,
    "preferenceMisses": 1,
    "roomMisses": 2,
    "edgeMisses": 8,
    "shiftMisses": 4,
}


def gaps_in_day(slots: list[int]) -> int:
    """Empty pairs between the first and last occupied pair of a day."""
    if len(slots) < 2:
        return 0
    s = sorted(set(slots))
    return s[-1] - s[0] + 1 - len(s)


def _js_round(x: float) -> float:
    """Math.round(x * 10) / 10 like JavaScript (halves go up)."""
    import math

    return math.floor(x * 10 + 0.5) / 10


def _student_views(ds: dict) -> list[tuple[str, int | None]]:
    views: list[tuple[str, int | None]] = []
    for g in ds["groups"]:
        if g["subgroups"] > 1:
            views += [(g["id"], s + 1) for s in range(g["subgroups"])]
        else:
            views.append((g["id"], None))
    return views


def _hits_view(idx: DatasetIndex, lesson: dict, view: tuple[str, int | None]) -> bool:
    a = idx.assignment_of(lesson)
    if not a:
        return False
    gid, sub = view
    return any(g == gid and (s is None or sub is None or s == sub) for g, s in idx.cohorts(a["audience"]))


def score_timetable(ds: dict, all_lessons: list[dict], idx: DatasetIndex | None = None) -> dict:
    idx = idx or DatasetIndex(ds)
    b = {k: 0.0 for k in SOFT_WEIGHTS}
    s = ds["settings"]
    weeks = ["odd", "even"] if s["weekParity"] else ["weekly"]
    week_share = 1 / len(weeks)
    days = list(range(s["workingDays"]))
    lessons = [l for l in all_lessons if not l.get("date")]  # weekly rules; dated pairs are scored per date below

    # teachers: gaps and preferred periods
    by_teacher: dict[str, list[dict]] = defaultdict(list)
    for l in lessons:
        a = idx.assignment_of(l)
        if a:
            by_teacher[a["teacherId"]].append(l)
    for tid, tl in by_teacher.items():
        for week in weeks:
            for d in days:
                b["teacherGaps"] += week_share * gaps_in_day([l["slot"] for l in tl if l["day"] == d and in_week(l, week)])
        pref = (idx.teachers.get(tid) or {}).get("preferred") or []
        if pref:
            b["preferenceMisses"] += sum(1 for l in tl if f"{l['day']}:{l['slot']}" not in pref) * 0.5

    # students: gaps, overloaded days, unbalanced week
    for view in _student_views(ds):
        vl = [l for l in lessons if _hits_view(idx, l, view)]
        if not vl:
            continue
        group_days = idx.group_days(view[0])
        for week in weeks:
            per_day = [[l["slot"] for l in vl if l["day"] == d and in_week(l, week)] for d in group_days]
            for d in group_days:
                dl = [l for l in vl if l["day"] == d and in_week(l, week)]
                if not dl:
                    continue
                lo, hi = min(l["slot"] for l in dl), max(l["slot"] for l in dl)
                for l in dl:
                    subj = idx.subjects.get((idx.assignment_of(l) or {}).get("subjectId", ""))
                    if subj and subj.get("edgeOfDay") and l["slot"] not in (lo, hi):
                        b["edgeMisses"] += week_share
            for slots in per_day:
                b["groupGaps"] += week_share * gaps_in_day(slots)
                b["dayOverload"] += week_share * max(0, len(set(slots)) - idx.group_max_pairs(view[0]))
            loads = [len(set(sl)) for sl in per_day]
            avg = sum(loads) / len(loads) if loads else 0
            b["unevenDays"] += week_share * sum(abs(x - avg) for x in loads)

    # session pairs (reduced attendance): no gaps within each date
    by_group_date: dict[str, list[int]] = defaultdict(list)
    for l in all_lessons:
        if not l.get("date"):
            continue
        a = idx.assignment_of(l)
        for gid, _ in idx.cohorts(a["audience"] if a else {"kind": "group", "id": ""}):
            by_group_date[f"{gid}|{l['date']}"].append(l["slot"])
    for slots in by_group_date.values():
        b["groupGaps"] += gaps_in_day(slots)

    # pairs outside their preferred ("de dorit") rooms
    for l in all_lessons:
        a = idx.assignment_of(l)
        if not a:
            continue
        pref = idx.preferred_rooms(a)
        if pref and not any(r["id"] == l["roomId"] for r in pref):
            b["roomMisses"] += parity_weight(l["parity"])

    # pairs outside the part of the day of their year of study (session pairs count per session)
    sessions = max(1, len(s.get("reducedSessions") or []) or 1)
    for l in all_lessons:
        a = idx.assignment_of(l)
        if a:
            b["shiftMisses"] += idx.shift_distance(a, l["slot"]) * ((1 / sessions) if l.get("date") else parity_weight(l["parity"]))

    # 08:00 classes have ~10 points lower attendance, unless years of study have their own part of the day
    if not s.get("yearShifts"):
        b["earlyStarts"] = sum(parity_weight(l["parity"]) for l in lessons if l["slot"] == 0)

    breakdown = {k: _js_round(v) for k, v in b.items()}
    soft = _js_round(sum(breakdown[k] * SOFT_WEIGHTS[k] for k in breakdown))
    return {"hard": len(find_hard_conflicts(ds, all_lessons, idx)), "soft": soft, "breakdown": breakdown}
