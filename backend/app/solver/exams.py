"""Exam session, reexaminations and atestari (UTM regulation REG-85-OS ECTS and the academic calendar). A port of
frontend/src/domain/exams.ts (generateExams, generateMidterms, midtermsFor), rule for rule, with the same seeded
random generator, so that the backend and the frontend's mock give the same answers.

One exam a day, at least `examMinGap` free days between a group's exams, a consultation the day before (or just
before), retakes in afternoon pairs. Atestari 1 and 2 are held in the subject's own classes in the teaching weeks
7-8 and 14-15 (or in a separate timetable after classes)."""
import json
from datetime import date

from ..domain.calendar import (
    add_days, days_between, evaluation_of, group_period_weeks, internship_on, midterm_weeks_of, parse, periods_of, range_dates,
    session_dates, start_times_in, teaching_week, to_hhmm, to_min, vacation_on, weekday,
)
from ..domain.indexes import DatasetIndex
from ..domain.slots import parities_overlap
from .rng import Rng

TYPE_ORDER = ["seminar", "lab", "lecture", "project"]  # project last: used only when a subject has nothing else
EXAM_ORDER = ["lecture", "seminar", "lab", "project"]


class _Ids:
    def __init__(self):
        self.n = 0

    def __call__(self) -> str:
        self.n += 1
        return f"E{self.n}"


def _overlaps(a: dict, b: dict) -> bool:
    return a["date"] == b["date"] and to_min(a["start"]) < to_min(b["end"]) and to_min(b["start"]) < to_min(a["end"])


def _same_students(a: dict, b: dict) -> bool:
    return a["groupId"] == b["groupId"] and not (a.get("subgroup") and b.get("subgroup") and a["subgroup"] != b["subgroup"])


def _clash(a: dict, b: dict) -> bool:
    """Same teacher, room or students at once (a class shared by groups is fine)."""
    return (
        _overlaps(a, b)
        and not (a.get("lessonId") and a.get("lessonId") == b.get("lessonId"))
        and (a["teacherId"] == b["teacherId"] or a["roomId"] == b["roomId"] or _same_students(a, b))
    )


def exam_available(unavailable: list[str] | None, d: str, start: str, end: str) -> bool:
    """Is the teacher free to examine then? (exam-period availability: whole or half days)"""
    if not unavailable:
        return True
    if d in unavailable:
        return False
    noon = 13 * 60
    if to_min(start) < noon and f"{d}|am" in unavailable:
        return False
    if to_min(end) > noon and f"{d}|pm" in unavailable:
        return False
    return True


def exam_subjects(ds: dict, idx: DatasetIndex, group_id: str) -> list[str]:
    ids = list(dict.fromkeys(a["subjectId"] for a in ds["assignments"] if idx.audience_touches_group(a["audience"], group_id)))
    return [i for i in ids if (idx.subjects.get(i, {}).get("evaluation") or "exam") == "exam"]


def examiner_of(ds: dict, idx: DatasetIndex, group_id: str, subject_id: str) -> str | None:
    loads = [a for a in ds["assignments"] if a["subjectId"] == subject_id and idx.audience_touches_group(a["audience"], group_id)]
    loads.sort(key=lambda a: EXAM_ORDER.index(a["type"]))
    return loads[0]["teacherId"] if loads else None


def _previous_exam_day(ev: dict, days: list[int], d: str) -> str:
    """The working day before (a Monday exam's consultation is on Friday), skipping holidays."""
    cur = add_days(d, -1)
    i = 0
    while i < 21 and (weekday(cur) not in days or vacation_on(ev, cur)):
        cur = add_days(cur, -1)
        i += 1
    return cur


def _consultation_for(ev: dict, days: list[int], exam: dict, rng: Rng, rooms: list[dict], free, new_id) -> dict | None:
    same_day = {"date": exam["date"], "start": to_hhmm(to_min(exam["start"]) - 60), "minutes": 45}
    before = _previous_exam_day(ev, days, exam["date"])
    if ev["consultation"] == "sameDay" or days_between(before, exam["date"]) > 3:
        tries = [same_day]
    else:
        tries = [{"date": before, "start": s, "minutes": ev["consultationMinutes"]} for s in rng.shuffle(start_times_in(ev["examFrom"], ev["examTo"], ev["consultationMinutes"]))]
    for t in tries:
        end = to_hhmm(to_min(t["start"]) + t["minutes"])
        for room_id in [exam["roomId"]] + [r["id"] for r in rooms if r["id"] != exam["roomId"]]:
            e = {**exam, "id": new_id(), "kind": "consultation", "roomId": room_id, "date": t["date"], "start": t["start"], "end": end}
            if free(e):
                return e
    return None


def generate_exams(ds: dict, idx: DatasetIndex, group_ids: list[str], round_: str, busy: list[dict], rng: Rng, classes: list[dict] | None = None, today: date | None = None) -> dict:
    """Place the exams (or retakes) of the groups with their consultations. `busy` = events already fixed."""
    classes = classes or []
    new_id = _Ids()
    ev = evaluation_of(ds, "licenta", today)
    placed: list[dict] = []
    warnings: list[dict] = []
    free = lambda e: not any(_clash(o, e) for o in busy + placed)
    cycle_ev = {"licenta": ev, "master": evaluation_of(ds, "master", today)}

    def rules(gev: dict):
        minutes = gev["examMinutes"] if round_ == "session" else gev["reexamMinutes"]
        window = start_times_in(gev["examFrom"], gev["examTo"], minutes) if round_ == "session" else start_times_in(gev["reexamFrom"], gev["reexamTo"], minutes)
        return minutes, window, gev["examMinGap"]

    def rooms_for(size: int, group_id: str, subject_id: str) -> list[dict]:
        taught = {l["roomId"] for l in classes if (a := idx.assignment_of(l)) and a["subjectId"] == subject_id and idx.audience_touches_group(a["audience"], group_id)}
        rooms = [r for r in ds["rooms"] if r["type"] != "lab" and "sport" not in r["equipment"] and r["capacity"] >= size]
        return sorted(rooms, key=lambda r: (r["id"] not in taught, r["capacity"]))

    order = rng.shuffle(group_ids)
    order.sort(key=lambda g: -len(exam_subjects(ds, idx, g)))
    for group_id in order:
        group = idx.groups.get(group_id)
        if not group:
            continue
        gev = cycle_ev[group.get("cycle") or "licenta"]
        minutes, window, min_gap = rules(gev)
        semester_end = sorted(r["end"] for r in gev["examSession"])[-1] if gev["examSession"] else gev["semesterStart"]
        own_session = [p for p in periods_of(ds, group_id, "examSession") if p["end"] >= gev["semesterStart"] and p["start"] <= semester_end]
        if round_ == "reexam":
            ranges = gev["reexamSession"]
        elif own_session:
            ranges = own_session
        elif group["studyForm"] == "reduced":
            ranges = gev["reducedExamSession"]
        else:
            ranges = gev["examSession"]
        days = gev["reducedExamDays"] if group["studyForm"] == "reduced" else gev["examDays"]
        dates = [d for d in range_dates(ranges, days, gev["vacations"]) if not internship_on(ds, group_id, d)]
        subjects = rng.shuffle(exam_subjects(ds, idx, group_id))
        subjects.sort(key=lambda s: -(idx.subjects.get(s, {}).get("credits") or 0))
        size = idx.audience_size({"kind": "group", "id": group_id})
        last: str | None = None
        for subject_id in subjects:
            teacher_id = examiner_of(ds, idx, group_id, subject_id)
            if not teacher_id or not dates:
                warnings.append({"groupId": group_id, "subjectId": subject_id, "kind": "unplaced"})
                continue
            teacher_unavailable = (idx.teachers.get(teacher_id) or {}).get("examUnavailable")
            teacher_free = lambda d, s, e, tu=teacher_unavailable: exam_available(tu, d, s, e)
            rooms = rooms_for(size, group_id, subject_id)
            done: dict | None = None
            gap = min_gap
            while gap >= 0 and not done:
                earliest = add_days(last, gap + 1) if last else dates[0]
                for d in [x for x in dates if x >= earliest]:
                    for start in rng.shuffle(window):
                        end = to_hhmm(to_min(start) + minutes)
                        if not teacher_free(d, start, end):
                            continue
                        room = next((r for r in rooms if free({"id": "", "kind": "exam", "round": round_, "subjectId": subject_id, "groupId": group_id, "teacherId": teacher_id, "roomId": r["id"], "date": d, "start": start, "end": end})), None)
                        if not room:
                            continue
                        exam = {"id": new_id(), "kind": "exam", "round": round_, "subjectId": subject_id, "groupId": group_id, "teacherId": teacher_id, "roomId": room["id"], "date": d, "start": start, "end": end}
                        consultation = _consultation_for(gev, days, exam, rng, rooms, lambda e: free(e) and not _clash(e, exam) and teacher_free(e["date"], e["start"], e["end"]), new_id)
                        if not consultation:
                            continue
                        done = exam
                        placed += [exam, consultation]
                        break
                    if done:
                        break
                if done and gap < min_gap:
                    warnings.append({"groupId": group_id, "subjectId": subject_id, "kind": "tight"})
                gap -= 1
            if done:
                last = done["date"]
            else:
                warnings.append({"groupId": group_id, "subjectId": subject_id, "kind": "unplaced"})
    return {"events": placed, "warnings": warnings}


# ---------------------------------------------------------------- atestari


def _group_midterms(ds: dict, idx: DatasetIndex, lessons: list[dict], group_id: str, n: int, cache: dict, today: date | None) -> list[dict]:
    """A group's atestari in class over the period: for each subject one of its own classes, no two on one day."""
    key = f"{group_id}|{n}"
    if key in cache:
        return cache[key]
    group = idx.groups.get(group_id)
    ev = evaluation_of(ds, (group or {}).get("cycle") or "licenta", today)
    period_weeks = group_period_weeks(ds, ev, group_id, n)
    views = list(range(1, group["subgroups"] + 1)) if group and group["subgroups"] > 1 else [0]
    mine = [l for l in lessons if not l.get("date") and (a := idx.assignment_of(l)) and idx.audience_touches_group(a["audience"], group_id)]
    items: list[dict] = []
    for subject_id in dict.fromkeys(idx.assignment_of(l)["subjectId"] for l in mine):
        own = [l for l in mine if idx.assignment_of(l)["subjectId"] == subject_id]
        type_ = next((tp for tp in TYPE_ORDER if any(idx.assignment_of(l)["type"] == tp for l in own)), None)
        by_audience: dict[str, list[dict]] = {}
        for l in own:
            if idx.assignment_of(l)["type"] == type_:
                by_audience.setdefault(json.dumps(idx.assignment_of(l)["audience"], sort_keys=True), []).append(l)
        for lst in by_audience.values():
            aud = idx.assignment_of(lst[0])["audience"]
            options = []
            for w in period_weeks:
                start = teaching_week(ev, w)["start"]
                parity = "odd" if w % 2 == 1 else "even"
                options += [{"lesson": l, "date": add_days(start, l["day"])} for l in lst if l["parity"] in ("weekly", parity)]
            options = [o for o in options if not vacation_on(ev, o["date"])]
            options.sort(key=lambda o: (o["date"], o["lesson"]["slot"]))
            fallback = []
            if aud["kind"] != "subgroup" and type_ != "lecture":
                lectures = [l for l in own if idx.assignment_of(l)["type"] == "lecture"]
                for w in period_weeks:
                    start = teaching_week(ev, w)["start"]
                    parity = "odd" if w % 2 == 1 else "even"
                    for l in [x for x in lectures if x["parity"] in ("weekly", parity)]:
                        d = add_days(start, l["day"])
                        if not vacation_on(ev, d):
                            fallback.append({"lesson": l, "date": d})
            if options or fallback:
                items.append({"subjectId": subject_id, "views": [aud["subgroup"]] if aud["kind"] == "subgroup" else views, "options": options + fallback})
    items.sort(key=lambda it: len(it["options"]))
    taken: dict[str, set[int]] = {}
    chosen: list[dict | None] = [None] * len(items)
    fits = lambda i, o: not any(v in taken.get(o["date"], set()) for v in items[i]["views"])

    def mark(i: int, o: dict, on: bool) -> None:
        s = taken.setdefault(o["date"], set())
        for v in items[i]["views"]:
            s.add(v) if on else s.discard(v)

    steps = [0]

    def solve(i: int) -> bool:
        if i == len(items):
            return True
        steps[0] += 1
        if steps[0] > 20000:
            return False
        for o in items[i]["options"]:
            if not fits(i, o):
                continue
            mark(i, o, True)
            chosen[i] = o
            if solve(i + 1):
                return True
            mark(i, o, False)
            chosen[i] = None
        return False

    if not solve(0):
        # no way to keep them all on separate days: place greedily, sharing a day only where needed
        taken.clear()
        for i, it in enumerate(items):
            o = next((x for x in it["options"] if fits(i, x)), it["options"][0])
            mark(i, o, True)
            chosen[i] = o
    out = [{**chosen[i], "subjectId": it["subjectId"]} for i, it in enumerate(items)]
    cache[key] = out
    return out


def midterms_for(ds: dict, idx: DatasetIndex, lessons: list[dict], group_id: str, today: date | None = None) -> list[dict]:
    """Atestari held in the subject's own classes: [{n, date, lesson}], sorted by date and pair."""
    ev = evaluation_of(ds, "licenta", today)
    out: dict[str, dict] = {}
    groups_of = lambda l: [g for g, _ in idx.cohorts(idx.assignment_of(l)["audience"])]
    pairs: dict[str, None] = {}
    for l in lessons:
        a = idx.assignment_of(l)
        if not a:
            continue
        for g in groups_of(l):
            if g == group_id:
                pairs[f"{a['subjectId']}|{g}"] = None
    cache: dict = {}
    for key in pairs:
        subject_id, gid = key.split("|")
        own = [l for l in lessons if (a := idx.assignment_of(l)) and a["subjectId"] == subject_id and gid in groups_of(l)]
        reduced = idx.groups.get(gid, {}).get("studyForm") == "reduced"
        for n in (1, 2):
            if reduced:
                sessions = ds["settings"].get("reducedSessions") or []
                rng_ = sessions[n - 1] if len(sessions) >= n else None
                dated = [l for l in own if l.get("date") and rng_ and rng_["start"] <= l["date"] <= rng_["end"]]
                last_date = sorted(l["date"] for l in dated)[-1] if dated else None
                chosen = [{"lesson": l, "date": l["date"]} for l in [x for x in dated if x["date"] == last_date][-1:]]
            else:
                chosen = [m for m in _group_midterms(ds, idx, lessons, gid, n, cache, today) if m["subjectId"] == subject_id]
            for c in chosen:
                if vacation_on(ev, c["date"]):
                    continue
                out[f"{n}|{c['lesson']['id']}|{c['date']}"] = {"n": n, "date": c["date"], "lesson": c["lesson"]}
    return sorted(out.values(), key=lambda m: (m["date"], m["lesson"]["slot"]))


def generate_midterms(ds: dict, idx: DatasetIndex, group_ids: list[str], n: int, classes: list[dict], busy: list[dict], rng: Rng, retake: bool = False, today: date | None = None) -> dict:
    round_ = ("remidterm1" if n == 1 else "remidterm2") if retake else ("midterm1" if n == 1 else "midterm2")
    new_id = _Ids()

    def make_ctx(ev: dict, group_weeks: list[int] | None = None) -> dict:
        weeks = group_weeks or ([ev["midtermRetakeWeeks"][n - 1]] if retake else midterm_weeks_of(ev, n))
        rng_ = {"start": teaching_week(ev, weeks[0])["start"], "end": teaching_week(ev, weeks[-1])["end"]}

        def parity_on(d: str) -> str:
            w = next((x for x in weeks if teaching_week(ev, x)["start"] <= d <= teaching_week(ev, x)["end"]), weeks[0])
            return "odd" if w % 2 == 1 else "even"

        return {
            "ev": ev, "parityOn": parity_on,
            "dates": [d for d in session_dates(rng_["start"], rng_["end"], ev["examDays"]) if not vacation_on(ev, d)],
            "times": start_times_in(ev["reexamFrom"], ev["reexamTo"], ev["midtermMinutes"]) if retake else ev["midtermStartTimes"],
            "reducedDates": range_dates(ev["reducedExamSession"], ev["reducedExamDays"], ev["vacations"]),
        }

    ctxs = {"licenta": make_ctx(evaluation_of(ds, "licenta", today)), "master": make_ctx(evaluation_of(ds, "master", today))}
    placed: list[dict] = []
    warnings: list[dict] = []

    def classes_at(d: str, start: str, end: str, parity_on) -> list[dict]:
        day = weekday(d)
        parity = parity_on(d)
        out = []
        for l in classes:
            if l.get("date") or l["day"] != day or not parities_overlap(l["parity"], parity):
                continue
            slot = ds["settings"]["slots"][l["slot"]] if l["slot"] < len(ds["settings"]["slots"]) else None
            if slot and to_min(slot["start"]) < to_min(end) and to_min(start) < to_min(slot["end"]):
                out.append(l)
        return out

    def rooms(size: int) -> list[dict]:
        return sorted((r for r in ds["rooms"] if r["type"] != "lab" and "sport" not in r["equipment"] and r["capacity"] >= size), key=lambda r: r["capacity"])

    for group_id in rng.shuffle(group_ids):
        group = idx.groups.get(group_id) or {}
        reduced = group.get("studyForm") == "reduced"
        base = ctxs[group.get("cycle") or "licenta"]
        own = group_period_weeks(ds, base["ev"], group_id, n) if (not retake and periods_of(ds, group_id, "internship")) else None
        if own is not None and not own:
            continue
        ctx = make_ctx(base["ev"], own) if own else base
        ev = ctx["ev"]
        if not retake and (ev["midtermMode"] == "inClass" or reduced):
            for m in [x for x in midterms_for(ds, idx, classes, group_id, today) if x["n"] == n]:
                a = idx.assignment_of(m["lesson"])
                slot = ds["settings"]["slots"][m["lesson"]["slot"]]
                e = {"id": new_id(), "kind": "exam", "round": round_, "subjectId": a["subjectId"], "groupId": group_id, "teacherId": a["teacherId"],
                     "roomId": m["lesson"]["roomId"], "date": m["date"], "start": slot["start"], "end": slot["end"], "lessonId": m["lesson"]["id"]}
                if a["audience"]["kind"] == "subgroup":
                    e["subgroup"] = a["audience"]["subgroup"]
                placed.append(e)
            continue
        subjects = rng.shuffle(list(dict.fromkeys(a["subjectId"] for a in ds["assignments"] if idx.audience_touches_group(a["audience"], group_id))))
        size = idx.audience_size({"kind": "group", "id": group_id})
        for i, subject_id in enumerate(subjects):
            teacher_id = examiner_of(ds, idx, group_id, subject_id)
            if not teacher_id:
                continue
            group_dates = ctx["reducedDates"] if reduced else ctx["dates"]
            start_at = (i * len(group_dates)) // max(1, len(subjects))
            order = group_dates[start_at:] + group_dates[:start_at]
            done = False
            for d in order:
                if any(e["groupId"] == group_id and e["date"] == d and e["round"] == round_ for e in busy + placed):
                    continue
                for start in ctx["times"]:
                    end = to_hhmm(to_min(start) + ev["midtermMinutes"])
                    taken = classes_at(d, start, end, ctx["parityOn"])
                    if any(idx.audience_touches_group(idx.assignment_of(l)["audience"], group_id) or idx.assignment_of(l)["teacherId"] == teacher_id for l in taken):
                        continue
                    room = next((r for r in rooms(size) if not any(l["roomId"] == r["id"] for l in taken)
                                 and not any(_clash(o, {"id": "", "kind": "exam", "round": round_, "subjectId": subject_id, "groupId": group_id, "teacherId": teacher_id, "roomId": r["id"], "date": d, "start": start, "end": end}) for o in busy + placed)), None)
                    if not room:
                        continue
                    placed.append({"id": new_id(), "kind": "exam", "round": round_, "subjectId": subject_id, "groupId": group_id, "teacherId": teacher_id, "roomId": room["id"], "date": d, "start": start, "end": end})
                    done = True
                    break
                if done:
                    break
            if not done:
                warnings.append({"groupId": group_id, "subjectId": subject_id, "kind": "unplaced"})
    return {"events": placed, "warnings": warnings}
