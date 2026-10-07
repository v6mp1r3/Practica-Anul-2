"""Port of frontend/src/domain/validator.ts: the hard constraints a timetable must satisfy."""
from collections import defaultdict

from .indexes import DatasetIndex
from .slots import lessons_overlap, slot_key


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
                if ax["teacherId"] == ay["teacherId"]:
                    out.append({**base, "kind": "teacher-clash", "subjectId": ax["teacherId"]})
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
        teacher = idx.teachers.get(a["teacherId"])
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

    # every assignment gets exactly its required number of pairs
    placed: dict[str, list[str]] = defaultdict(list)
    for l in lessons:
        placed[l["assignmentId"]].append(l["id"])
    for a in ds["assignments"]:
        ids = placed.get(a["id"], [])
        need = idx.required_pairs(a)
        if len(ids) < need:
            out.append({"kind": "hours-missing", "severity": "hard", "lessonIds": ids, "subjectId": a["id"]})
        if len(ids) > need:
            out.append({"kind": "hours-extra", "severity": "hard", "lessonIds": ids, "subjectId": a["id"]})
    return out
