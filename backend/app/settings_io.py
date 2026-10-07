"""The frontend keeps one big Settings object; the database spreads it over several tables
(institution_settings, time_slot, form_rule/form_day, year_shift, reduced_session, academic_calendar and its
children, group_period). This module converts in both directions."""
import re
from collections import defaultdict
from typing import NamedTuple

from sqlalchemy import Connection, text

from .errors import ApiError
from .util import hhmm, iso_date, pid

# what the calendar falls back to for fields the client leaves out (frontend/src/domain/exams.ts)
DEFAULT_EVALUATION = {
    "midtermWeeks": [7, 14], "midtermSpanWeeks": 2, "midtermRetakeWeeks": [9, 15], "midtermMode": "inClass",
    "midtermStartTimes": ["15:15", "17:00", "18:45"], "midtermMinutes": 90,
    "examSession": [], "reducedExamSession": [], "reexamSession": [], "vacations": [],
    "examDays": [0, 1, 2, 3, 4], "reducedExamDays": [0, 1, 2, 3, 4, 5, 6], "examMinGap": 1,
    "examFrom": "08:00", "examTo": "18:00", "examMinutes": 135, "consultation": "dayBefore", "consultationMinutes": 90,
    "reexamFrom": "13:00", "reexamTo": "19:00", "reexamMinutes": 90,
}
# fields master's shares with licență instead of overriding
SHARED = ("semesterStart", "vacations", "holidayOverrides")
SEMESTER_RE = re.compile(r"^(Toamna|Primăvara)\s+(\d{4})/(\d{4})$")


class Semester(NamedTuple):
    id: int
    label: str


def current_semester(conn: Connection) -> Semester:
    row = conn.execute(text("select id, label from semester where is_current")).first()
    if not row:
        raise ApiError(500, "There is no current semester. Run backend/db/seed.sql first.")
    return Semester(row[0], row[1])


def ensure_semester(conn: Connection, label: str) -> Semester:
    """The semester named like 'Toamna 2026/2027': found, or created, and made the current one."""
    row = conn.execute(text("select id, label, is_current from semester where label = :l"), {"l": label}).first()
    if row:
        if not row[2]:
            conn.execute(text("update semester set is_current = false where is_current"))
            conn.execute(text("update semester set is_current = true where id = :i"), {"i": row[0]})
        return Semester(row[0], row[1])
    m = SEMESTER_RE.match(label.strip())
    if not m:
        raise ApiError(422, "Semester must look like 'Toamna 2026/2027' or 'Primăvara 2026/2027'")
    conn.execute(text("update semester set is_current = false where is_current"))
    new_id = conn.execute(
        text("insert into semester (label, academic_year, season, is_current) values (:l, :y, :s, true) returning id"),
        {"l": label.strip(), "y": f"{m.group(2)}/{m.group(3)}", "s": "autumn" if m.group(1) == "Toamna" else "spring"},
    ).scalar_one()
    return Semester(new_id, label.strip())


# ---------------------------------------------------------------- read


def _ranges(rows) -> list[dict]:
    return [{"start": iso_date(r["start_date"]), "end": iso_date(r["end_date"])} for r in rows]


def _read_calendar(conn: Connection, sem: int, cycle: str) -> tuple[dict, dict] | None:
    cal = conn.execute(
        text("select * from academic_calendar where semester_id = :s and cycle = cast(:c as study_cycle)"), {"s": sem, "c": cycle}
    ).mappings().first()
    if not cal:
        return None
    p = {"s": sem, "c": cycle}
    periods = defaultdict(list)
    for r in conn.execute(
        text("select kind, name, start_date, end_date from calendar_period where semester_id = :s and cycle = cast(:c as study_cycle) order by start_date, end_date"), p
    ).mappings():
        periods[r["kind"]].append(r)
    days = defaultdict(list)
    for r in conn.execute(
        text("select kind, day from calendar_day_rule where semester_id = :s and cycle = cast(:c as study_cycle) order by day"), p
    ).mappings():
        days[r["kind"]].append(r["day"])
    times = [hhmm(r[0]) for r in conn.execute(text("select start_time from midterm_start_time where semester_id = :s and cycle = cast(:c as study_cycle) order by start_time"), p)]
    ev = {
        "semesterStart": iso_date(cal["semester_start"]),
        "midtermWeeks": [cal["midterm1_week"], cal["midterm2_week"]],
        "midtermSpanWeeks": cal["midterm_span_weeks"],
        "midtermRetakeWeeks": [cal["retake1_week"], cal["retake2_week"]],
        "midtermMode": cal["midterm_mode"],
        "midtermStartTimes": times,
        "midtermMinutes": cal["midterm_minutes"],
        "examSession": _ranges(periods["exam_session"]),
        "reducedExamSession": _ranges(periods["reduced_exam_session"]),
        "reexamSession": _ranges(periods["reexam_session"]),
        "vacations": [{"name": r["name"] or "", **_ranges([r])[0]} for r in periods["vacation"]],
        "examDays": days["exam"],
        "reducedExamDays": days["reduced_exam"],
        "examMinGap": cal["exam_min_gap"],
        "examFrom": hhmm(cal["exam_from"]),
        "examTo": hhmm(cal["exam_to"]),
        "examMinutes": cal["exam_minutes"],
        "consultation": cal["consultation_mode"],
        "consultationMinutes": cal["consultation_minutes"],
        "reexamFrom": hhmm(cal["reexam_from"]),
        "reexamTo": hhmm(cal["reexam_to"]),
        "reexamMinutes": cal["reexam_minutes"],
    }
    if cycle == "licenta":
        overrides = {}
        for r in conn.execute(text("select holiday_key, start_date, end_date from holiday_override where semester_id = :s and cycle = 'licenta'"), {"s": sem}).mappings():
            overrides[r["holiday_key"]] = None if r["start_date"] is None else {"start": iso_date(r["start_date"]), "end": iso_date(r["end_date"])}
        if overrides:
            ev["holidayOverrides"] = overrides
    return ev, {"startOffsetWeeks": cal["start_offset_weeks"]}


def _year_shifts(conn: Connection, sem: int, cycle: str) -> list[dict]:
    rows = conn.execute(
        text("select first_slot, last_slot from year_shift where semester_id = :s and cycle = cast(:c as study_cycle) order by year"), {"s": sem, "c": cycle}
    ).all()
    return [{"first": r[0], "last": r[1]} for r in rows]


def read_settings(conn: Connection) -> dict:
    sem = current_semester(conn)
    row = conn.execute(text("select * from institution_settings where semester_id = :s"), {"s": sem.id}).mappings().first()
    if not row:
        raise ApiError(500, "The current semester has no settings. Run backend/db/seed.sql first.")
    form_days: dict[str, list[int]] = {"full": [], "reduced": [], "dual": []}
    for r in conn.execute(text("select study_form::text as f, day from form_day where semester_id = :s order by day"), {"s": sem.id}).mappings():
        form_days[r["f"]].append(r["day"])
    form_max = {r[0]: r[1] for r in conn.execute(text("select study_form::text, max_pairs_per_day from form_rule where semester_id = :s"), {"s": sem.id})}
    s = {
        "institutionName": row["institution_name"],
        "faculties": [r[0] for r in conn.execute(text("select name from faculty order by id"))],
        "semester": sem.label,
        "workingDays": row["working_days"],
        "formDays": form_days,
        "formMaxPairs": {f: form_max.get(f, row["max_pairs_day_group"]) for f in ("full", "reduced", "dual")},
        "reducedSessions": _ranges(conn.execute(text("select start_date, end_date from reduced_session where semester_id = :s order by start_date"), {"s": sem.id}).mappings()),
        "lessonMinutes": row["lesson_minutes"],
        "timeFormat": row["time_format"],
        "slots": [{"start": hhmm(r[0]), "end": hhmm(r[1])} for r in conn.execute(text("select start_time, end_time from time_slot order by slot_index"))],
        "weekParity": row["week_parity"],
        "maxPairsPerDayGroup": row["max_pairs_day_group"],
        "minPairsPerDayGroup": row["min_pairs_day_group"],
        "maxPairsPerDayTeacher": row["max_pairs_day_teacher"],
        "consultationRequired": row["consultation_required"],
    }
    shifts = _year_shifts(conn, sem.id, "licenta")
    if shifts:
        s["yearShifts"] = shifts
    master_shifts = _year_shifts(conn, sem.id, "master")
    if master_shifts:
        s["masterYearShifts"] = master_shifts
    lic = _read_calendar(conn, sem.id, "licenta")
    if lic:
        s["evaluation"] = lic[0]
        mas = _read_calendar(conn, sem.id, "master")
        if mas:
            # only what differs from licență, as the frontend expects
            diff = {k: v for k, v in mas[0].items() if k not in SHARED and lic[0].get(k) != v}
            s["masterEvaluation"] = {"startOffsetWeeks": mas[1]["startOffsetWeeks"], **diff}
    periods: dict[int, dict] = {}
    for r in conn.execute(text("select id, kind, start_date, end_date from group_period where semester_id = :s order by start_date, id"), {"s": sem.id}).mappings():
        periods[r["id"]] = {"id": str(r["id"]), "kind": r["kind"], "start": iso_date(r["start_date"]), "end": iso_date(r["end_date"]), "groupIds": []}
    if periods:
        for r in conn.execute(text("select period_id, group_id from group_period_group where period_id = any(cast(:p as bigint[])) order by group_id"), {"p": list(periods)}):
            periods[r[0]]["groupIds"].append(str(r[1]))
        s["groupPeriods"] = list(periods.values())
    return s


# ---------------------------------------------------------------- write


def _write_calendar(conn: Connection, sem: int, cycle: str, ev: dict, semester_start: str, offset: int, shared: dict | None) -> None:
    conn.execute(text("delete from academic_calendar where semester_id = :s and cycle = cast(:c as study_cycle)"), {"s": sem, "c": cycle})
    d = {**DEFAULT_EVALUATION, **ev}
    mw, rw = d["midtermWeeks"], d["midtermRetakeWeeks"]
    conn.execute(
        text(
            "insert into academic_calendar (semester_id, cycle, semester_start, start_offset_weeks, midterm1_week, midterm2_week, midterm_span_weeks, retake1_week, retake2_week, "
            "midterm_mode, midterm_minutes, exam_min_gap, exam_from, exam_to, exam_minutes, consultation_mode, consultation_minutes, reexam_from, reexam_to, reexam_minutes) values "
            "(:s, cast(:c as study_cycle), cast(:start as date), :off, :m1, :m2, :span, :r1, :r2, cast(:mode as midterm_mode), :mmin, :gap, cast(:ef as time), cast(:et as time), :emin, "
            "cast(:cons as consultation_mode), :cmin, cast(:rf as time), cast(:rt as time), :rmin)"
        ),
        {
            "s": sem, "c": cycle, "start": semester_start, "off": offset, "m1": mw[0], "m2": mw[1], "span": d["midtermSpanWeeks"], "r1": rw[0], "r2": rw[1],
            "mode": d["midtermMode"], "mmin": d["midtermMinutes"], "gap": d["examMinGap"], "ef": d["examFrom"], "et": d["examTo"], "emin": d["examMinutes"],
            "cons": d["consultation"], "cmin": d["consultationMinutes"], "rf": d["reexamFrom"], "rt": d["reexamTo"], "rmin": d["reexamMinutes"],
        },
    )
    key = {"s": sem, "c": cycle}
    days = [{**key, "k": "exam", "d": x} for x in sorted(set(d["examDays"]))] + [{**key, "k": "reduced_exam", "d": x} for x in sorted(set(d["reducedExamDays"]))]
    if days:
        conn.execute(text("insert into calendar_day_rule (semester_id, cycle, kind, day) values (:s, cast(:c as study_cycle), :k, :d)"), days)
    periods = []
    for kind, field in (("exam_session", "examSession"), ("reduced_exam_session", "reducedExamSession"), ("reexam_session", "reexamSession")):
        periods += [{**key, "k": kind, "n": None, "a": r["start"], "b": r["end"]} for r in d[field]]
    if shared is not None:  # extra days off belong to licență's calendar; master's shares them
        periods += [{**key, "k": "vacation", "n": v.get("name") or "", "a": v["start"], "b": v["end"]} for v in d["vacations"]]
    if periods:
        conn.execute(
            text("insert into calendar_period (semester_id, cycle, kind, name, start_date, end_date) values (:s, cast(:c as study_cycle), :k, :n, cast(:a as date), cast(:b as date))"), periods
        )
    times = sorted(set(d["midtermStartTimes"]))
    if times:
        conn.execute(text("insert into midterm_start_time (semester_id, cycle, start_time) values (:s, cast(:c as study_cycle), cast(:t as time))"), [{**key, "t": t} for t in times])
    if shared and shared.get("holidayOverrides"):
        conn.execute(
            text("insert into holiday_override (semester_id, cycle, holiday_key, start_date, end_date) values (:s, 'licenta', :k, cast(:a as date), cast(:b as date))"),
            [{"s": sem, "k": k, "a": (v or {}).get("start"), "b": (v or {}).get("end")} for k, v in shared["holidayOverrides"].items()],
        )


def save_settings(conn: Connection, s: dict) -> dict:
    sem = ensure_semester(conn, s["semester"])
    key = {"s": sem.id}
    conn.execute(text("delete from institution_settings where semester_id = :s"), key)
    conn.execute(
        text(
            "insert into institution_settings (semester_id, institution_name, working_days, lesson_minutes, time_format, week_parity, max_pairs_day_group, "
            "min_pairs_day_group, max_pairs_day_teacher, consultation_required) values (:s, :name, :wd, :lm, cast(:tf as time_format), :wp, :mg, :ng, :mt, :cr)"
        ),
        {**key, "name": s["institutionName"], "wd": s["workingDays"], "lm": s["lessonMinutes"], "tf": s.get("timeFormat") or "24h", "wp": s["weekParity"],
         "mg": s["maxPairsPerDayGroup"], "ng": s["minPairsPerDayGroup"], "mt": s["maxPairsPerDayTeacher"], "cr": s["consultationRequired"]},
    )

    for field in ("yearShifts", "masterYearShifts"):
        for sh in s.get(field) or []:
            if not (0 <= sh["first"] <= sh["last"] < len(s["slots"])):
                raise ApiError(422, f"{field}: pairs {sh['first'] + 1}-{sh['last'] + 1} do not exist, there are {len(s['slots'])} pairs")
    # the pair grid is shared by all semesters: update in place, drop extra rows only if nothing uses them
    slots = s["slots"]
    for i, sl in enumerate(slots):
        conn.execute(
            text("insert into time_slot (slot_index, start_time, end_time) values (:i, cast(:a as time), cast(:b as time)) "
                 "on conflict (slot_index) do update set start_time = excluded.start_time, end_time = excluded.end_time"),
            {"i": i, "a": sl["start"], "b": sl["end"]},
        )
    conn.execute(text("delete from year_shift where semester_id = :s"), key)
    try:
        with conn.begin_nested():
            conn.execute(text("delete from time_slot where slot_index >= :n"), {"n": len(slots)})
    except Exception:
        raise ApiError(409, "Some pair times are still used by timetables or teacher availability")

    conn.execute(text("delete from form_rule where semester_id = :s"), key)  # cascades to form_day
    for form in ("full", "reduced", "dual"):
        conn.execute(
            text("insert into form_rule (semester_id, study_form, max_pairs_per_day) values (:s, cast(:f as study_form), :m)"),
            {**key, "f": form, "m": s["formMaxPairs"].get(form, s["maxPairsPerDayGroup"])},
        )
        days = sorted(set(s["formDays"].get(form, [])))
        if days:
            conn.execute(text("insert into form_day (semester_id, study_form, day) values (:s, cast(:f as study_form), :d)"), [{**key, "f": form, "d": x} for x in days])
    for cycle, field in (("licenta", "yearShifts"), ("master", "masterYearShifts")):
        rows = [{**key, "c": cycle, "y": i + 1, "a": sh["first"], "b": sh["last"]} for i, sh in enumerate(s.get(field) or [])]
        if rows:
            conn.execute(text("insert into year_shift (semester_id, cycle, year, first_slot, last_slot) values (:s, cast(:c as study_cycle), :y, :a, :b)"), rows)
    conn.execute(text("delete from reduced_session where semester_id = :s"), key)
    if s.get("reducedSessions"):
        conn.execute(
            text("insert into reduced_session (semester_id, start_date, end_date) values (:s, cast(:a as date), cast(:b as date))"),
            [{**key, "a": r["start"], "b": r["end"]} for r in s["reducedSessions"]],
        )

    # calendars: licență as sent; master's = licență's with its own overrides on top
    conn.execute(text("delete from academic_calendar where semester_id = :s"), key)
    ev = s.get("evaluation")
    if ev:
        _write_calendar(conn, sem.id, "licenta", ev, ev["semesterStart"], 0, {"holidayOverrides": ev.get("holidayOverrides")})
        me = s.get("masterEvaluation")
        if me is not None:
            base = {k: v for k, v in ev.items() if k not in SHARED}
            over = {k: v for k, v in me.items() if k != "startOffsetWeeks"}
            _write_calendar(conn, sem.id, "master", {**base, **over}, ev["semesterStart"], me.get("startOffsetWeeks", 0), None)

    conn.execute(text("delete from group_period where semester_id = :s"), key)
    for gp in s.get("groupPeriods") or []:
        pid_ = conn.execute(
            text("insert into group_period (semester_id, kind, start_date, end_date) values (:s, :k, cast(:a as date), cast(:b as date)) returning id"),
            {**key, "k": gp["kind"], "a": gp["start"], "b": gp["end"]},
        ).scalar_one()
        groups = sorted({pid(g) for g in gp.get("groupIds") or []})
        if groups:
            conn.execute(text("insert into group_period_group (period_id, group_id) values (:p, :g)"), [{"p": pid_, "g": g} for g in groups])
    return read_settings(conn)
