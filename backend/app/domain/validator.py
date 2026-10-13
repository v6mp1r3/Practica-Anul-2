"""Port of frontend/src/domain/validator.ts: the hard constraints a timetable must satisfy."""
from collections import defaultdict

from .indexes import DatasetIndex, teacher_ids
from .slots import lessons_overlap, slot_key
from .weeks import week_counts, week_excess, week_need


def find_hard_conflicts(ds: dict, lessons: list[dict], idx: DatasetIndex | None = None) -> list[dict]:
    idx = idx or DatasetIndex(ds)
    out: list[dict] = []
    settings = ds["settings"]

    # pairwise clashes inside the same slot
    by_slot: dict[str, list[dict]] = defaultdict(list)
    for l in lessons:
        by_slot[slot_key(l["day"], l["slot"])].append(l)
    for group in by_slot.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                x, y = group[i], group[j]
                if not lessons_overlap(x, y):
                    continue
                ax, ay = idx.assignment_of(x), idx.assignment_of(y)
                if not ax or not ay:
                    continue
                base = {"severity": "hard", "lessonIds": [x["id"], y["id"]], "day": x["day"], "slot": x["slot"]}
                shared = [t for t in teacher_ids(ax) if t in teacher_ids(ay)]
                if shared:
                    out.append({**base, "kind": "teacher-clash", "subjectId": shared[0]})
                if x["roomId"] == y["roomId"]:
                    out.append({**base, "kind": "room-clash", "subjectId": x["roomId"]})
                if idx.audiences_overlap(ax["audience"], ay["audience"]):
                    first = idx.cohorts(ax["audience"])
                    out.append({**base, "kind": "group-clash", "subjectId": first[0][0] if first else ""})

    # per-lesson checks
    for l in lessons:
        a = idx.assignment_of(l)
        if not a:
            continue
        base = {"severity": "hard", "lessonIds": [l["id"]], "day": l["day"], "slot": l["slot"]}
        if l["day"] < 0 or l["day"] >= settings["workingDays"] or l["slot"] < 0 or l["slot"] >= len(settings["slots"]):
            out.append({**base, "kind": "outside-hours", "subjectId": a["id"]})
        if l["day"] < settings["workingDays"] and l["day"] not in idx.allowed_days(a):
            out.append({**base, "kind": "wrong-day", "subjectId": a["id"]})
        for tid in teacher_ids(a):
            teacher = idx.teachers.get(tid)
            if teacher and slot_key(l["day"], l["slot"]) in teacher["unavailable"]:
                out.append({**base, "kind": "teacher-unavailable", "subjectId": teacher["id"]})
        room = idx.rooms.get(l["roomId"])
        if room:
            if room["capacity"] < idx.audience_size(a["audience"]):
                out.append({**base, "kind": "room-capacity", "subjectId": room["id"]})
            if not idx.room_fits(a, room):
                out.append({**base, "kind": "room-type", "subjectId": room["id"]})
            if not idx.has_equipment(a, room):
                out.append({**base, "kind": "room-equipment", "subjectId": room["id"]})

    # every assignment gets exactly its required number of pairs; a weekly load in odd and in even weeks alike
    placed: dict[str, list[dict]] = defaultdict(list)
    for l in lessons:
        placed[l["assignmentId"]].append(l)
    for a in ds["assignments"]:
        own = placed.get(a["id"], [])
        ids = [l["id"] for l in own]
        base = {"severity": "hard", "lessonIds": ids, "subjectId": a["id"]}
        if idx.is_reduced(a):
            need = idx.required_pairs(a)
            if len(ids) < need:
                out.append({**base, "kind": "hours-missing"})
            if len(ids) > need:
                out.append({**base, "kind": "hours-extra"})
            continue
        weekly = [l for l in own if not l.get("date")]
        if week_excess(a["pairsPerWeek"], weekly):
            out.append({**base, "kind": "hours-extra"})
        elif week_need(a["pairsPerWeek"], weekly):
            odd, even = week_counts(weekly)
            # the right number of pairs, all in one kind of week: odd weeks have more and even weeks fewer
            whole = odd + even >= round(2 * a["pairsPerWeek"])
            out.append({**base, "kind": "hours-uneven" if whole else "hours-missing"})
    return out
