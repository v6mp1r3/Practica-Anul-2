"""The CP-SAT model and the LNS generator, on a small hand-made university (no database needed)."""
import copy
import random
from collections import Counter

import pytest

from app.domain import score as score_module
from app.domain.indexes import DatasetIndex
from app.domain.score import ABSOLUTE_WEIGHT, SOFT_WEIGHTS, STRICT_WEIGHT, score_timetable, weights_for
from app.domain.validator import find_hard_conflicts
from app.solver.generate import generate_timetable, scope_assignments, term_semester, timetable_semester
from app.solver.absolute import Rules, enforce, find_violations
from app.solver.greedy import construct
from app.solver.model import SCALE, solve_weekly

pytestmark = pytest.mark.no_db

SETTINGS = {
    "institutionName": "UTM", "faculties": [], "semester": "Toamna 2026/2027", "workingDays": 5,
    "formDays": {"full": [0, 1, 2, 3, 4], "reduced": [0, 1, 2, 3, 4, 5, 6], "dual": [0, 1, 2, 3, 4]},
    "formMaxPairs": {"full": 4, "reduced": 6, "dual": 4}, "reducedSessions": [], "lessonMinutes": 90,
    "slots": [{"start": f"{8 + 2 * i:02d}:00", "end": f"{9 + 2 * i:02d}:30"} for i in range(6)],
    "weekParity": True, "maxPairsPerDayGroup": 4, "minPairsPerDayGroup": 2, "maxPairsPerDayTeacher": 5, "consultationRequired": False,
    "yearShifts": [{"first": 0, "last": 3}, {"first": 1, "last": 4}],
}


def teacher(tid, **kw):
    return {"id": tid, "name": f"Teacher {tid}", "title": "", "department": "", "email": "", "maxPairsPerWeek": 20,
            "activityTypes": ["lecture", "seminar", "lab"], "unavailable": [], "preferred": [], "examUnavailable": [], **kw}


def room(rid, cap, typ, **kw):
    return {"id": rid, "name": rid, "building": "B", "capacity": cap, "type": typ, "equipment": [], **kw}


def group(gid, size=24, **kw):
    return {"id": gid, "name": gid.upper(), "program": "P", "year": 1, "size": size, "studyForm": "full", "subgroups": 1, "cycle": "licenta", **kw}


def subject(sid, **kw):
    return {"id": sid, "code": sid.upper(), "name": sid, "credits": 5, "year": 1, "lecturePairs": 1, "seminarPairs": 1, "labPairs": 0, **kw}


def load(aid, sub, teacher_id, audience, typ="seminar", pairs=1, room_type=None, **kw):
    return {"id": aid, "subjectId": sub, "type": typ, "teacherId": teacher_id, "audience": audience, "pairsPerWeek": pairs,
            "roomType": room_type or typ, "equipment": [], **kw}


def tiny():
    return {
        "settings": copy.deepcopy(SETTINGS),
        "teachers": [teacher("t1"), teacher("t2", preferred=["0:1", "1:1", "2:1"]), teacher("t3", unavailable=[f"{d}:{s}" for d in range(5) for s in (0, 1, 2)])],
        "rooms": [room("r1", 60, "lecture"), room("r2", 30, "seminar"), room("r3", 30, "lab", equipment=["pc"]), room("r4", 30, "seminar")],
        "groups": [group("g1", subgroups=2), group("g2"), group("g3")],
        "streams": [{"id": "s1", "name": "S", "groupIds": ["g1", "g2"]}],
        "subjects": [subject("am"), subject("pc"), subject("sport", edgeOfDay=True)],
        "assignments": [
            load("a1", "am", "t1", {"kind": "stream", "id": "s1"}, "lecture", 2),
            load("a2", "am", "t2", {"kind": "group", "id": "g1"}, "seminar", 1),
            load("a3", "am", "t2", {"kind": "group", "id": "g2"}, "seminar", 1),
            load("a4", "pc", "t3", {"kind": "subgroup", "id": "g1", "subgroup": 1}, "lab", 1, equipment=["pc"]),
            load("a5", "pc", "t3", {"kind": "subgroup", "id": "g1", "subgroup": 2}, "lab", 1, equipment=["pc"]),
            load("a6", "pc", "t1", {"kind": "group", "id": "g3"}, "seminar", 1),
            load("a7", "pc", "t1", {"kind": "group", "id": "g3"}, "seminar", 1),
            load("a8", "sport", "t2", {"kind": "group", "id": "g2"}, "seminar", 1),
        ],
    }


def lessons_of(placements):
    return [p.as_lesson(f"L{i}") for i, p in enumerate(placements)]


def need_of(ds):
    idx = DatasetIndex(ds)
    return {a["id"]: int(idx.required_pairs(a)) for a in ds["assignments"]}


def test_a_complete_timetable_without_hard_problems():
    ds = tiny()
    idx = DatasetIndex(ds)
    res = solve_weekly(ds, idx, need_of(ds), [], 3, seed=1, workers=4)
    assert res.status in ("OPTIMAL", "FEASIBLE") and not res.missing
    lessons = lessons_of(res.placements)
    assert len(lessons) == 9
    assert find_hard_conflicts(ds, lessons) == []
    # the lab needs the lab room and its equipment, the third teacher is only free from the 4th pair
    labs = [l for l in lessons if l["assignmentId"] in ("a4", "a5")]
    assert {l["roomId"] for l in labs} == {"r3"} and all(l["slot"] >= 3 for l in labs)
    # the odd-week and the even-week pair of the same teacher and group may share a time
    assert {l["assignmentId"] for l in lessons} == set(need_of(ds))


def pinned_objective(ds, placements):
    """The model's objective when the pairs are pinned to a timetable, as a soft score."""
    idx = DatasetIndex(ds)
    res = solve_weekly(ds, idx, need_of(ds), [], 20, seed=1, workers=4, jitter=False, fix=placements)
    assert res.status == "OPTIMAL" and not res.missing
    return res.objective / SCALE


def test_the_objective_is_the_soft_score(monkeypatch):
    """Pinned to any timetable, the model's objective divided by its scale is that timetable's score.soft."""
    monkeypatch.setattr(score_module, "_js_round", lambda x: x)  # compare without the 0.1 rounding
    for variant in range(4):
        ds = tiny()
        if variant == 1:
            ds["settings"]["weekParity"] = False
        if variant == 2:
            ds["settings"].pop("yearShifts")  # then 08:00 classes cost something
            ds["rooms"].append(room("r5", 60, "lecture"))
            ds["rooms"][3]["preferredSubjectIds"] = ["am"]
        if variant == 3:
            ds["groups"][1]["subgroups"] = 2
            ds["assignments"][2]["audience"] = {"kind": "subgroup", "id": "g2", "subgroup": 1}
            ds["assignments"][2]["pairsPerWeek"] = 2
        idx = DatasetIndex(ds)
        for seed in (1, 2, 3):  # several different timetables, good and bad
            res = solve_weekly(ds, idx, need_of(ds), [], 1, seed=seed, workers=4, jitter=True)
            assert not res.missing
            soft = score_timetable(ds, lessons_of(res.placements))["soft"]
            assert pinned_objective(ds, res.placements) == pytest.approx(soft, abs=1e-6), (variant, seed)


def test_the_objective_is_the_soft_score_on_the_demo_university(monkeypatch):
    """The same on the frontend's demo data (18 groups, 103 loads), for a timetable its own generator made."""
    import json
    from pathlib import Path

    from app.solver.model import Placement

    monkeypatch.setattr(score_module, "_js_round", lambda x: x)
    data = json.loads((Path(__file__).parent / "fixtures" / "parity.json").read_text())
    ds = data["dataset"]
    idx = DatasetIndex(ds)
    weekly = [a for a in ds["assignments"] if not idx.is_reduced(a)]
    lessons = [l for l in data["cases"][0]["lessons"] if not l.get("date") and idx.assignments[l["assignmentId"]] in weekly]
    scoped = {**ds, "assignments": weekly}
    soft = score_timetable(scoped, lessons, idx)["soft"]
    assert pinned_objective(scoped, [Placement(l["assignmentId"], l["day"], l["slot"], l["roomId"], l["parity"]) for l in lessons]) == pytest.approx(soft, abs=1e-6)


def test_fixed_pairs_stay_and_stay_booked():
    ds = tiny()
    idx = DatasetIndex(ds)
    fixed = [{"id": "F1", "assignmentId": "a1", "day": 0, "slot": 1, "roomId": "r1", "parity": "weekly", "locked": True}]
    other = {a: n for a, n in need_of(ds).items() if a != "a1"}
    other["a1"] = 1  # the second pair of the lecture
    res = solve_weekly(ds, idx, other, fixed, 3, seed=3, workers=4)
    lessons = lessons_of(res.placements) + fixed
    assert find_hard_conflicts(ds, lessons) == []
    assert [l for l in lessons if l["assignmentId"] == "a1"].__len__() == 2
    busy = [l for l in res.placements if (l.day, l.slot) == (0, 1)]
    # nothing that needs teacher t1, room r1, group g1 or g2 may be at Monday 2nd pair
    for p in busy:
        a = idx.assignments[p.assignmentId]
        assert a["teacherId"] != "t1" and p.roomId != "r1" and not idx.audiences_overlap(a["audience"], idx.assignments["a1"]["audience"])


def test_an_impossible_demand_is_reported_not_crashed():
    ds = tiny()
    ds["teachers"][2]["unavailable"] = [f"{d}:{s}" for d in range(5) for s in range(6)]  # t3 never free
    idx = DatasetIndex(ds)
    res = solve_weekly(ds, idx, need_of(ds), [], 2, seed=1, workers=4)
    assert res.status in ("OPTIMAL", "FEASIBLE") and res.missing == {"a4": 1, "a5": 1}
    assert res.objective >= 2 * 500_000
    assert len(res.placements) == 7


def test_first_or_last_pair_only_subjects():
    ds = tiny()
    idx = DatasetIndex(ds)
    res = solve_weekly(ds, idx, need_of(ds), [], 6, seed=4, workers=4)
    score = score_timetable(ds, lessons_of(res.placements))
    assert score["breakdown"]["edgeMisses"] == 0


def test_generate_improves_and_keeps_what_it_must():
    ds = tiny()
    next(a for a in ds["assignments"] if a["id"] == "a6")["pairsPerWeek"] = 0.5  # every other week: its odd-week pair is all of it
    kept = {"id": "K1", "assignmentId": "a6", "day": 0, "slot": 2, "roomId": "r2", "parity": "odd"}  # g3's lessons are "another faculty's"
    locked = {"id": "Lk", "assignmentId": "a2", "day": 3, "slot": 2, "roomId": "r4", "parity": "weekly", "locked": True}
    seen = []
    r = generate_timetable(ds, ["g1", "g2"], seed=5, seconds=6, fixed=[locked], keep=[kept], progress=lambda p, s: seen.append((p, s["hard"])), workers=2)
    ids = {l["id"] for l in r.lessons}
    assert "K1" in ids and "Lk" in ids  # the locked and the kept pairs come back, unchanged
    lk = next(l for l in r.lessons if l["id"] == "Lk")
    assert (lk["day"], lk["slot"], lk["roomId"]) == (3, 2, "r4")
    # g1 and g2's loads are all there (a2 once, from the lock); g3's other load is not scheduled here
    count = Counter(l["assignmentId"] for l in r.lessons)
    assert count["a1"] == 2 and count["a2"] == 1 and count["a3"] == 1 and count["a4"] == count["a5"] == 1 and count["a8"] == 1
    assert "a7" not in count and r.missing == 0 and r.score["hard"] == 0
    assert find_hard_conflicts({**ds, "assignments": [a for a in ds["assignments"] if a["id"] != "a7"]}, r.lessons) == []
    assert seen[-1][0] == 1.0 and all(0 <= p <= 1 for p, _ in seen) and r.steps >= 1


def test_generate_places_reduced_attendance_on_session_dates():
    ds = tiny()
    ds["groups"].append(group("fr", studyForm="reduced"))
    ds["settings"]["reducedSessions"] = [{"start": "2026-10-12", "end": "2026-10-14"}, {"start": "2027-01-11", "end": "2027-01-12"}]
    ds["settings"]["formDays"]["reduced"] = [0, 1, 2, 3, 4, 5, 6]
    ds["assignments"].append(load("a9", "am", "t1", {"kind": "group", "id": "fr"}, "lecture", 1, pairsPerSession=2))
    r = generate_timetable(ds, ["fr"], seed=6, seconds=3, workers=2)
    dated = [l for l in r.lessons if l["assignmentId"] == "a9"]
    assert len(dated) == 4 and all(l["date"] for l in dated)  # 2 pairs in each of the 2 sessions
    sessions = ds["settings"]["reducedSessions"]
    assert all(any(s["start"] <= l["date"] <= s["end"] for s in sessions) for l in dated)
    assert r.score["hard"] == 0


def test_contradictory_data_still_returns_something():
    ds = tiny()
    ds["rooms"] = [room("r1", 10, "lecture")]  # nothing fits any group
    r = generate_timetable(ds, ["g1", "g2", "g3"], seed=1, seconds=3, workers=2)
    assert r.missing > 0 and r.score["hard"] > 0


def test_generate_follows_an_example_timetable():
    ds = tiny()
    first = generate_timetable(ds, ["g1", "g2", "g3"], seed=3, seconds=3, workers=2)
    at = lambda ls: Counter((l["assignmentId"], l["day"], l["slot"]) for l in ls)
    example = at(first.lessons)
    followed = generate_timetable(ds, ["g1", "g2", "g3"], seed=77, seconds=3, workers=2, example=first.lessons)
    same = sum((at(followed.lessons) & example).values())
    assert same == len(first.lessons) and followed.score["hard"] == 0
    # a pair the example has somewhere it no longer fits (the teacher is away then) is placed elsewhere
    ds["teachers"][0]["unavailable"] = [f"{l['day']}:{l['slot']}" for l in first.lessons if l["assignmentId"] == "a6"]
    moved = generate_timetable(ds, ["g1", "g2", "g3"], seed=77, seconds=3, workers=2, example=first.lessons)
    assert moved.score["hard"] == 0 and moved.missing == 0
    assert all(f"{l['day']}:{l['slot']}" not in ds["teachers"][0]["unavailable"] for l in moved.lessons if l["assignmentId"] in ("a1", "a6", "a7"))


def test_every_teacher_of_a_project_is_busy_in_its_pairs():
    ds = tiny()
    # t1 gives the lecture a1 and holds the project of g3 together with t2
    ds["assignments"].append(load("p1", "pc", "t2", {"kind": "group", "id": "g3"}, "project", 1, room_type="seminar", coTeacherIds=["t1"]))
    idx = DatasetIndex(ds)
    lec = {"id": "X", "assignmentId": "a1", "day": 0, "slot": 1, "roomId": "r1", "parity": "weekly"}
    proj = {"id": "Y", "assignmentId": "p1", "day": 0, "slot": 1, "roomId": "r2", "parity": "weekly"}
    assert [c["kind"] for c in find_hard_conflicts(ds, [lec, proj], idx) if c["kind"] == "teacher-clash"] == ["teacher-clash"]
    res = solve_weekly(ds, idx, need_of(ds), [], 3, seed=1, workers=4)
    assert res.status in ("OPTIMAL", "FEASIBLE") and not res.missing
    lessons = lessons_of(res.placements)
    assert find_hard_conflicts(ds, lessons) == []
    t1_slots = [(l["day"], l["slot"]) for l in lessons if "t1" in (idx.assignments[l["assignmentId"]]["teacherId"], *idx.assignments[l["assignmentId"]].get("coTeacherIds", []))]
    assert len(t1_slots) == len(set(t1_slots))


def test_half_pairs_go_to_odd_or_even_weeks():
    ds = tiny()
    loads = {a["id"]: a for a in ds["assignments"]}
    loads["a6"]["pairsPerWeek"] = 0.5  # every other week
    loads["a7"]["pairsPerWeek"] = 1.5  # every week, plus every other week
    r = generate_timetable(ds, ["g1", "g2", "g3"], seed=3, seconds=4, workers=2)
    assert r.missing == 0 and find_hard_conflicts(ds, r.lessons) == []
    parities = lambda aid: sorted(l["parity"] for l in r.lessons if l["assignmentId"] == aid)
    assert parities("a6") in (["odd"], ["even"])
    # 1.5 pairs a week is three half pairs (a weekly pair is two of them): a weekly pair and a half pair, or three half pairs
    # when that is what lets both weeks reach the minimum number of pairs on their day
    halves = lambda aid: 2 * parities(aid).count("weekly") + parities(aid).count("odd") + parities(aid).count("even")
    assert halves("a7") == 3 and halves("a6") == 1


def test_an_alternating_pair_counts_as_one_pair_per_week():
    ds = tiny()
    idx = DatasetIndex(ds)
    lesson = lambda lid, aid, d, s, room, parity: {"id": lid, "assignmentId": aid, "day": d, "slot": s, "roomId": room, "parity": parity}
    sem = lambda *ls: [c["kind"] for c in find_hard_conflicts({**ds, "assignments": [idx.assignments["a2"]]}, list(ls), idx)]
    # a2 is one seminar per week: odd weeks Monday pair 2, even weeks Monday pair 3
    assert sem(lesson("x", "a2", 0, 1, "r2", "odd"), lesson("y", "a2", 0, 2, "r2", "even")) == []
    assert sem(lesson("x", "a2", 0, 1, "r2", "odd")) == ["hours-missing"]
    assert sem(lesson("x", "a2", 0, 1, "r2", "odd"), lesson("y", "a2", 0, 2, "r2", "odd")) == ["hours-uneven"]
    # improving the timetable keeps it complete: a freed odd-week pair comes back in odd weeks
    fixed = [lesson("x", "a2", 0, 1, "r2", "odd"), lesson("y", "a2", 1, 2, "r2", "even")]
    r = generate_timetable(ds, ["g1", "g2", "g3"], seed=8, seconds=4, example=fixed, workers=2)
    own = [l for l in r.lessons if l["assignmentId"] == "a2"]
    assert find_hard_conflicts(ds, r.lessons) == [] and r.missing == 0
    assert sorted(l["parity"] for l in own) in (["even", "odd"], ["weekly"])


def test_a_teacher_off_in_odd_weeks_only():
    ds = tiny()
    t1 = next(t for t in ds["teachers"] if t["id"] == "t1")
    t1["unavailableOdd"] = [f"{d}:{s}" for d in range(5) for s in range(6)]  # t1 never comes in odd weeks
    lec = {"id": "x", "assignmentId": "a1", "day": 0, "slot": 1, "roomId": "r1", "parity": "even"}
    kinds = lambda parity: [c["kind"] for c in find_hard_conflicts(ds, [{**lec, "parity": parity}]) if c["kind"] == "teacher-unavailable"]
    assert kinds("even") == [] and kinds("odd") == ["teacher-unavailable"] and kinds("weekly") == ["teacher-unavailable"]
    # t1's loads can't go every week; a half load of theirs goes to even weeks
    next(a for a in ds["assignments"] if a["id"] == "a6")["pairsPerWeek"] = 0.5
    r = generate_timetable(ds, ["g3"], seed=2, seconds=3, workers=2)
    a6 = [l for l in r.lessons if l["assignmentId"] == "a6"]
    assert [l["parity"] for l in a6] == ["even"]
    assert not [c for c in find_hard_conflicts(ds, r.lessons) if c["kind"] == "teacher-unavailable"]


def test_the_heuristic_leaves_no_gaps_in_odd_or_even_weeks():
    # Monday has an odd-week pair at pair 1 and an even-week pair at pair 2. Looked at over both weeks together, pair 3
    # seems to follow without a gap, but in odd weeks the group would have pairs 1 and 3 only. Gaps count per week.
    from app.domain.weeks import WeekNeed

    ds = tiny()
    ds = {**ds, "assignments": [a for a in ds["assignments"] if a["id"] in ("a6", "a7")]}
    next(a for a in ds["assignments"] if a["id"] == "a7")["subjectId"] = "am"  # not the same subject twice in a day
    next(t for t in ds["teachers"] if t["id"] == "t1")["unavailableOdd"] = ["0:1"]
    idx = DatasetIndex(ds)
    fixed = [
        {"id": "f1", "assignmentId": "a7", "day": 0, "slot": 0, "roomId": "r2", "parity": "odd"},
        {"id": "f2", "assignmentId": "a7", "day": 0, "slot": 1, "roomId": "r2", "parity": "even"},
    ]
    for seed in range(20):
        placed = lessons_of(construct(ds, idx, {"a6": WeekNeed(odd=1)}, fixed, random.Random(seed)))
        assert [p["parity"] for p in placed] == ["odd"]
        assert score_timetable(ds, fixed + placed, idx)["breakdown"]["groupGaps"] == 0, seed


def test_generate_for_one_semester_only():
    ds = tiny()
    next(s for s in ds["subjects"] if s["id"] == "pc")["semester"] = 2  # the others have none: the 1st
    subject_of = {a["id"]: a["subjectId"] for a in ds["assignments"]}
    groups = ["g1", "g2", "g3"]
    first = generate_timetable(ds, groups, seed=1, seconds=3, workers=2, semester=1)
    second = generate_timetable(ds, groups, seed=1, seconds=3, workers=2, semester=2)
    both = generate_timetable(ds, groups, seed=1, seconds=3, workers=2)
    subjects = lambda r: {subject_of[l["assignmentId"]] for l in r.lessons}
    assert subjects(first) == {"am", "sport"} and subjects(second) == {"pc"} and subjects(both) == {"am", "sport", "pc"}
    assert first.missing == 0 and second.missing == 0
    # another group's pairs of the other semester are not kept booked: the published timetable only holds the 1st
    kept = generate_timetable(ds, ["g1"], seed=1, seconds=3, workers=2, semester=2, keep=first.lessons)
    assert {subject_of[l["assignmentId"]] for l in kept.lessons} <= {"pc"}


def test_a_day_below_the_minimum_is_penalised_week_by_week():
    ds = tiny()
    ds = {**ds, "assignments": [a for a in ds["assignments"] if a["id"] in ("a6", "a7")]}
    assert ds["settings"]["minPairsPerDayGroup"] == 2
    lesson = lambda lid, aid, slot, parity: {"id": lid, "assignmentId": aid, "day": 0, "slot": slot, "roomId": "r2", "parity": parity}
    thin = lambda *ls: score_timetable(ds, list(ls))["breakdown"]["thinDays"]
    # two pairs every week: fine
    assert thin(lesson("x", "a6", 1, "weekly"), lesson("y", "a7", 2, "weekly")) == 0
    # one pair every week: 1 missing pair in odd weeks and in even weeks
    assert thin(lesson("x", "a6", 1, "weekly")) == 1
    # an odd-week pair next to a weekly one: Monday has 2 pairs in odd weeks but only 1 in even weeks
    assert thin(lesson("x", "a6", 1, "weekly"), lesson("y", "a7", 2, "odd")) == 0.5


def test_switching_a_rule_off_makes_it_strict_in_the_search_and_in_the_objective(monkeypatch):
    assert weights_for({"allowThinDays": True}) == SOFT_WEIGHTS
    # a day below the minimum is ruled out unless it is explicitly allowed
    assert weights_for(None)["thinDays"] == weights_for({"allowThinDays": False})["thinDays"] == ABSOLUTE_WEIGHT
    # no gaps between students' pairs is absolute like the minimum; the other rules switched off are strict
    w = weights_for({"allowGroupGaps": False, "allowTeacherGaps": False, "allowThinDays": True})
    assert w["groupGaps"] == ABSOLUTE_WEIGHT and w["teacherGaps"] == STRICT_WEIGHT and w["thinDays"] == SOFT_WEIGHTS["thinDays"]
    # the model's objective is the soft score under the same weights, strict ones included
    monkeypatch.setattr(score_module, "_js_round", lambda x: x)
    ds = tiny()
    idx = DatasetIndex(ds)
    res = solve_weekly(ds, idx, need_of(ds), [], 1, seed=2, workers=4, weights=w)
    assert not res.missing
    pinned = solve_weekly(ds, idx, need_of(ds), [], 20, seed=1, workers=4, jitter=False, fix=res.placements, weights=w)
    assert pinned.objective / SCALE == pytest.approx(score_timetable(ds, lessons_of(res.placements), weights=w)["soft"], abs=1e-6)


def test_generate_with_strict_rules_saves_the_usual_score():
    ds = tiny()
    r = generate_timetable(ds, ["g1", "g2", "g3"], seed=4, seconds=4, workers=2, rules={"allowGroupGaps": False, "allowTeacherGaps": False, "allowThinDays": True})
    assert r.missing == 0 and find_hard_conflicts(ds, r.lessons) == []
    assert r.score["breakdown"]["groupGaps"] == 0 and r.score["breakdown"]["teacherGaps"] == 0
    # comparable with other variants: the stored soft score uses the usual weights, not the strict ones
    assert r.score["soft"] == score_timetable({**ds, "assignments": ds["assignments"]}, r.lessons)["soft"]


def test_no_group_has_a_day_with_a_single_pair():
    # g1's own seminar has to share its only free day with something else: the solver may not leave it alone on a day
    ds = tiny()
    ds["settings"]["formDays"]["full"] = [0, 1, 2]
    for seed in (1, 2, 3):
        r = generate_timetable(ds, ["g1", "g2", "g3"], seed=seed, seconds=4, workers=2)
        assert r.score["breakdown"]["thinDays"] == 0, seed
        assert r.missing == 0 and find_hard_conflicts(ds, r.lessons) == []


def test_a_timetable_answers_for_one_semester():
    ds = tiny()
    next(s for s in ds["subjects"] if s["id"] == "pc")["semester"] = 2
    idx = DatasetIndex(ds)
    assert term_semester(ds) == 1
    assert term_semester({**ds, "settings": {**ds["settings"], "semester": "Primăvara 2026/2027"}}) == 2
    assert timetable_semester(ds, idx, []) == 1  # nothing in it yet: the term's
    first = generate_timetable(ds, ["g1", "g2", "g3"], seed=1, seconds=3, workers=2, semester=1)
    second = generate_timetable(ds, ["g1", "g2", "g3"], seed=1, seconds=3, workers=2, semester=2)
    assert timetable_semester(ds, idx, first.lessons) == 1 and timetable_semester(ds, idx, second.lessons) == 2
    # judged against its own semester's loads, a semester-1 timetable is not missing the semester-2 pairs
    own = {**ds, "assignments": scope_assignments(ds, idx, ["g1", "g2", "g3"], timetable_semester(ds, idx, first.lessons))}
    assert find_hard_conflicts(own, first.lessons) == []
    assert "hours-missing" in {c["kind"] for c in find_hard_conflicts(ds, first.lessons)}  # as it was before: all loads


def _day(*pairs, parity="weekly", aid="a6", day=0):
    return [{"id": f"{aid}-{day}-{s}-{parity}", "assignmentId": aid, "day": day, "slot": s, "roomId": "r2", "parity": parity} for s in pairs]


def test_enforce_takes_out_what_breaks_an_absolute_rule():
    ds = tiny()
    ds = {**ds, "assignments": [a for a in ds["assignments"] if a["id"] in ("a6", "a7")]}  # g3: 2 pairs a week
    idx = DatasetIndex(ds)
    rules = Rules({"allowGroupGaps": False})  # no gaps, and (the default) no day below the minimum
    # Monday has pairs 1, 2 and 5: the gap goes, the longer run stays. Tuesday has a pair alone: it goes.
    lessons = _day(0, 1, 4) + _day(2, day=1)
    found = {(v[1], v[3]) for v in find_violations(ds, idx, lessons, rules)}
    assert found == {(0, "gap"), (1, "thin")}
    kept = enforce(ds, idx, lessons, rules, set())
    assert sorted((l["day"], l["slot"]) for l in kept) == [(0, 0), (0, 1)]
    assert find_violations(ds, idx, kept, rules) == []
    # a locked pair stays, even alone: only what may move moves
    assert [l["slot"] for l in enforce(ds, idx, _day(2, day=1), rules, {"a6-1-2-weekly"})] == [2]
    # an odd-week pair beside a weekly one: even weeks have a single pair that day, so it is a thin day in even weeks
    mixed = _day(1) + _day(2, parity="odd", aid="a7")
    assert [(v[2], v[3]) for v in find_violations(ds, idx, mixed, rules)] == [("even", "thin")]
    # rules that are off ask for nothing
    assert enforce(ds, idx, lessons, Rules({"allowGroupGaps": True, "allowThinDays": True}), set()) == lessons


def test_generate_with_absolute_rules_never_leaves_a_gap_or_a_thin_day():
    ds = tiny()
    ds["settings"]["formDays"]["full"] = [0, 1, 2]
    idx = DatasetIndex(ds)
    for seed in (1, 2, 3):
        r = generate_timetable(ds, ["g1", "g2", "g3"], seed=seed, seconds=4, workers=2, rules={"allowGroupGaps": False})
        assert find_violations(ds, idx, r.lessons, Rules({"allowGroupGaps": False})) == [], seed
        assert r.score["breakdown"]["groupGaps"] == 0 and r.score["breakdown"]["thinDays"] == 0, seed
        assert not [c for c in find_hard_conflicts(ds, r.lessons) if c["kind"] not in ("hours-missing", "hours-uneven")]


def test_rooms_matched_afterwards_never_clash_and_fit():
    # the model without rooms in it: day and pair only, a capacity rule per kind of room, then a matching
    ds = tiny()
    idx = DatasetIndex(ds)
    need = need_of(ds)
    exact = solve_weekly(ds, idx, need, [], 3, seed=1, workers=4)
    fast = solve_weekly(ds, idx, need, [], 3, seed=1, workers=4, match_rooms=True)
    assert not fast.missing and fast.variables < exact.variables
    lessons = lessons_of(fast.placements)
    assert len(lessons) == len(exact.placements) and find_hard_conflicts(ds, lessons) == []
    # the lab keeps to the lab room with its equipment
    assert {l["roomId"] for l in lessons if l["assignmentId"] in ("a4", "a5")} == {"r3"}


def test_rooms_are_matched_around_fixed_pairs_and_leave_out_what_has_no_room():
    from app.solver.model import Placement
    from app.solver.rooms import assign_rooms

    ds = tiny()
    idx = DatasetIndex(ds)
    eligible = {"a2": frozenset({"r2", "r4"}), "a3": frozenset({"r2", "r4"}), "a6": frozenset({"r2", "r4"})}
    p = lambda aid, parity="weekly": Placement(aid, 0, 1, None, parity)
    fixed = [{"id": "f", "assignmentId": "a8", "day": 0, "slot": 1, "roomId": "r2", "parity": "odd"}]
    # two rooms, one of them used by a fixed odd-week pair: a weekly pair needs a room in both weeks, so only r4
    got = assign_rooms(ds, idx, [p("a2")], fixed, eligible)
    assert [x.roomId for x in got] == ["r4"]
    # a second pair at the same time has no room left: it is left out, not put in a room that is taken
    got = assign_rooms(ds, idx, [p("a2"), p("a3")], fixed, eligible)
    assert len(got) == 1
    # odd- and even-week pairs may share a room: they are never in the same week
    got = assign_rooms(ds, idx, [p("a2", "odd"), p("a3", "even")], [], eligible)
    assert len(got) == 2 and {x.roomId for x in got} <= {"r2", "r4"}


def test_mandatory_rooms_are_kept_by_the_model_the_heuristic_and_the_validator():
    """A subject or a group with a mandatory room has its classes there and nowhere else, whatever the room's type."""
    ds = tiny()
    ds["rooms"][3]["requiredSubjectIds"] = ["am"]  # every class of AM in r4 (30 seats) ...
    ds["rooms"][0]["requiredSubjectIds"] = ["am"]  # ... or r1 (60 seats), the only one the stream lecture of 48 fits in
    ds["rooms"][1]["requiredGroupIds"] = ["g3"]  # all of g3's classes in r2
    idx = DatasetIndex(ds)
    res = solve_weekly(ds, idx, need_of(ds), [], 3, seed=1, workers=4)
    assert not res.missing
    lessons = lessons_of(res.placements)
    assert find_hard_conflicts(ds, lessons) == []
    room_of = lambda ids: {l["roomId"] for l in lessons if l["assignmentId"] in ids}
    assert room_of({"a1", "a2", "a3"}) <= {"r1", "r4"} and room_of({"a6", "a7"}) == {"r2"}
    assert room_of({"a8"}) <= {"r2", "r4"}  # g2's sport is not g3's: any seminar room will do
    # the heuristic too
    built = construct(ds, idx, need_of(ds), [], random.Random(3))
    required = lambda p: idx.required_room_ids(idx.assignments[p.assignmentId])
    assert built and all(p.roomId in required(p) for p in built if required(p))
    # a pair moved out of its mandatory room is a hard conflict
    moved = [{**l, "roomId": "r4"} if l["assignmentId"] == "a6" else l for l in lessons]
    assert "room-required" in {c["kind"] for c in find_hard_conflicts(ds, moved)}
