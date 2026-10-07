"""Port of frontend/src/domain/holidays.ts, periods.ts and the calendar parts of exams.ts: days off of an
academic year, the evaluation settings of each study cycle, group periods and teaching weeks."""
from datetime import date, timedelta

DEFAULT_EVALUATION = {
    "semesterStart": "2026-08-31",
    "midtermWeeks": [7, 14],
    "midtermSpanWeeks": 2,
    "midtermRetakeWeeks": [9, 15],
    "midtermMode": "inClass",
    "midtermStartTimes": ["15:15", "17:00", "18:45"],
    "midtermMinutes": 90,
    "examSession": [{"start": "2026-12-14", "end": "2026-12-26"}, {"start": "2027-01-11", "end": "2027-01-23"}],
    "reducedExamSession": [{"start": "2027-01-25", "end": "2027-02-06"}],
    "reexamSession": [{"start": "2027-01-25", "end": "2027-02-06"}],
    "vacations": [],
    "examDays": [0, 1, 2, 3, 4],
    "reducedExamDays": [0, 1, 2, 3, 4, 5, 6],
    "examMinGap": 1,
    "examFrom": "08:00",
    "examTo": "18:00",
    "examMinutes": 135,
    "consultation": "dayBefore",
    "consultationMinutes": 90,
    "reexamFrom": "13:00",
    "reexamTo": "19:00",
    "reexamMinutes": 90,
}
DEFAULT_MASTER = {
    "startOffsetWeeks": 4,
    "midtermWeeks": [6, 11],
    "midtermRetakeWeeks": [9, 13],
    "examSession": [{"start": "2027-01-11", "end": "2027-01-30"}],
    "reexamSession": [{"start": "2027-02-01", "end": "2027-02-06"}],
    "examDays": [0, 1, 2, 3, 4, 5],
    "examFrom": "16:00",
    "examTo": "20:30",
    "consultation": "sameDay",
    "reexamFrom": "16:00",
    "reexamTo": "20:30",
}
SEMESTER_WEEKS = 15

# ---------------------------------------------------------------- dates


def parse(d: str) -> date:
    return date.fromisoformat(d)


def add_days(d: str, n: int) -> str:
    return (parse(d) + timedelta(days=n)).isoformat()


def weekday(d: str) -> int:
    return parse(d).weekday()


def days_between(a: str, b: str) -> int:
    return (parse(b) - parse(a)).days


def to_min(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def to_hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def start_times_in(frm: str, to: str, minutes: int) -> list[str]:
    """Start times every half hour in [from, to] that still end by `to`."""
    out, m = [], to_min(frm)
    while m + minutes <= to_min(to):
        out.append(to_hhmm(m))
        m += 30
    return out


def session_dates(start: str, end: str, days: list[int]) -> list[str]:
    out, d, last = [], parse(start), parse(end)
    while d <= last:
        if d.weekday() in days:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


# ---------------------------------------------------------------- holidays


def orthodox_easter(year: int) -> str:
    """Orthodox Easter Sunday (Meeus' Julian algorithm + 13 days)."""
    a, b, c = year % 4, year % 7, year % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    month = (d + e + 114) // 31
    day = ((d + e + 114) % 31) + 1
    return add_days(date(year, month, day).isoformat(), 13)


def academic_year_of(semester_start: str) -> int:
    d = parse(semester_start)
    return d.year if d.month >= 7 else d.year - 1


def current_academic_year(today: date) -> int:
    return today.year - (1 if today.month < 9 else 0)


def default_semester_start(today: date) -> str:
    sept = date(current_academic_year(today), 9, 1)
    return (sept - timedelta(days=sept.weekday())).isoformat()


def semester_start_of(stored: str | None, today: date) -> str:
    return stored if stored and academic_year_of(stored) >= current_academic_year(today) else default_semester_start(today)


def auto_holidays(y: int) -> list[dict]:
    n = y + 1
    easter = orthodox_easter(n)
    iso = lambda yy, m, d: date(yy, m, d).isoformat()
    w1, w2 = weekday(iso(y, 12, 28)), weekday(iso(n, 1, 8))
    breaks = [
        {"id": f"{y}:winter", "name": "Vacanța de iarnă", "start": add_days(iso(y, 12, 28), -w1), "end": add_days(iso(n, 1, 8), 6 - w2), "auto": True, "kind": "break"},
        {"id": f"{y}:easter", "name": "Vacanța de Paște", "start": easter, "end": add_days(easter, 6), "auto": True, "kind": "break"},
        {"id": f"{y}:summer", "name": "Vacanța de vară", "start": iso(n, 7, 1), "end": iso(n, 8, 31), "auto": True, "kind": "break"},
    ]

    def day(key: str, name: str, d: str, end: str | None = None) -> dict:
        return {"id": f"{y}:{key}", "name": name, "start": d, "end": end or d, "auto": True, "kind": "day"}

    days = [
        day("christmas", "Crăciunul (stil nou)", iso(y, 12, 25)),
        day("newyear", "Anul Nou", iso(n, 1, 1)),
        day("christmasOld", "Crăciunul (stil vechi)", iso(n, 1, 7), iso(n, 1, 8)),
        day("women", "Ziua Internațională a Femeii", iso(n, 3, 8)),
        day("pascha", "Paștele", easter, add_days(easter, 1)),
        day("blajini", "Paștele Blajinilor", add_days(easter, 8)),
        day("labour", "Ziua Muncii", iso(n, 5, 1)),
        day("victory", "Ziua Victoriei și a Europei", iso(n, 5, 9)),
        day("children", "Ziua Ocrotirii Copiilor", iso(n, 6, 1)),
        day("independence", "Ziua Independenței", iso(n, 8, 27)),
        day("language", "Limba noastră", iso(n, 8, 31)),
    ]
    in_break = lambda h: any(b["start"] <= h["start"] and h["end"] <= b["end"] for b in breaks)
    return sorted(breaks + [h for h in days if not in_break(h)], key=lambda h: h["start"])


def holidays_of(ev: dict) -> list[dict]:
    """All days off of the year: the automatic ones (moved or hidden by `holidayOverrides`) plus the added ones."""
    overrides = ev.get("holidayOverrides") or {}
    auto = []
    for h in auto_holidays(academic_year_of(ev["semesterStart"])):
        if h["id"] in overrides and overrides[h["id"]] is None:
            continue
        auto.append({**h, **overrides[h["id"]]} if overrides.get(h["id"]) else h)
    custom = [{**v, "id": f"custom:{i}", "auto": False, "kind": "day" if v["start"] == v["end"] else "break"} for i, v in enumerate(ev.get("vacations") or [])]
    fresh = [c for c in custom if not any(a["start"] == c["start"] and a["end"] == c["end"] for a in auto)]
    return sorted(auto + fresh, key=lambda h: (h["start"], h["end"]))


def evaluation_of(ds: dict, cycle: str = "licenta", today: date | None = None) -> dict:
    """The evaluation settings of a cycle; `vacations` is every day off of the year. Master's = licență's with its overrides."""
    today = today or date.today()
    stored = {**DEFAULT_EVALUATION, **(ds["settings"].get("evaluation") or {})}
    ev = {**stored, "semesterStart": semester_start_of(stored["semesterStart"], today)}
    lic = {**ev, "vacations": holidays_of(ev)}
    if cycle != "master":
        return lic
    m = {**DEFAULT_MASTER, **(ds["settings"].get("masterEvaluation") or {})}
    offset = m.pop("startOffsetWeeks", 4)
    return {**lic, **m, "semesterStart": add_days(lic["semesterStart"], 7 * offset), "vacations": lic["vacations"]}


def vacation_on(ev: dict, d: str) -> dict | None:
    return next((v for v in ev["vacations"] if v["start"] <= d <= v["end"]), None)


def range_dates(ranges: list[dict], days: list[int], vacations: list[dict] | None = None) -> list[str]:
    vacations = vacations or []
    found = {d for r in ranges for d in session_dates(r["start"], r["end"], days)}
    return sorted(d for d in found if not any(v["start"] <= d <= v["end"] for v in vacations))


def teaching_week(ev: dict, week: int) -> dict:
    """Monday-Sunday dates of a teaching week (week 1 starts on semesterStart's Monday)."""
    d = parse(ev["semesterStart"])
    start = (d - timedelta(days=d.weekday()) + timedelta(days=(week - 1) * 7)).isoformat()
    return {"start": start, "end": add_days(start, 6)}


# ---------------------------------------------------------------- group periods


def periods_of(ds: dict, group_id: str, kind: str | None = None) -> list[dict]:
    return [p for p in ds["settings"].get("groupPeriods") or [] if group_id in p["groupIds"] and (not kind or p["kind"] == kind)]


def internship_on(ds: dict, group_id: str, d: str) -> dict | None:
    return next((p for p in periods_of(ds, group_id, "internship") if p["start"] <= d <= p["end"]), None)


def teaching_weeks_of(ds: dict, ev: dict, group_id: str) -> list[int]:
    """The semester's teaching weeks the group has classes (not on internship or in its own exam session for most of the week)."""
    away_periods = periods_of(ds, group_id, "internship") + periods_of(ds, group_id, "examSession")
    weeks = []
    for w in range(1, SEMESTER_WEEKS + 1):
        start = teaching_week(ev, w)["start"]
        away = sum(1 for d in range(5) if any(p["start"] <= add_days(start, d) <= p["end"] for p in away_periods))
        if away < 3:
            weeks.append(w)
    return weeks


def group_midterm_week(ds: dict, ev: dict, group_id: str, n: int) -> int | None:
    if not periods_of(ds, group_id, "internship"):
        return ev["midtermWeeks"][n - 1]
    weeks = teaching_weeks_of(ds, ev, group_id)
    if len(weeks) == SEMESTER_WEEKS:
        return ev["midtermWeeks"][n - 1]
    if not weeks:
        return None
    if len(weeks) < 8:
        return weeks[max(0, len(weeks) - 2)] if n == 1 else None
    at = _js_round(len(weeks) * ev["midtermWeeks"][0] / SEMESTER_WEEKS) - 1 if n == 1 else len(weeks) - 2
    return weeks[min(len(weeks) - 1, max(0, at))]


def _js_round(x: float) -> int:
    import math

    return math.floor(x + 0.5)


def midterm_weeks_of(ev: dict, n: int) -> list[int]:
    return [ev["midtermWeeks"][n - 1] + i for i in range(max(1, ev["midtermSpanWeeks"]))]


def group_period_weeks(ds: dict, ev: dict, group_id: str, n: int) -> list[int]:
    """A group's atestare period weeks: the usual ones, or its own when an internship takes part of the semester."""
    if not periods_of(ds, group_id, "internship"):
        return midterm_weeks_of(ev, n)
    start = group_midterm_week(ds, ev, group_id, n)
    if start is None:
        return []
    teaching = teaching_weeks_of(ds, ev, group_id)
    weeks = [w for w in (start + i for i in range(max(1, ev["midtermSpanWeeks"]))) if w in teaching]
    return weeks or [start]
