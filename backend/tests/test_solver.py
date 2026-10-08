"""The CP-SAT model and the LNS generator, on a small hand-made university (no database needed)."""
import copy
from collections import Counter

import pytest

from app.domain import score as score_module
from app.domain.indexes import DatasetIndex
from app.domain.score import score_timetable
from app.domain.validator import find_hard_conflicts
from app.solver.generate import generate_timetable
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
