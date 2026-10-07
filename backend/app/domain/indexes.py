"""Port of frontend/src/domain/indexes.ts: lookup tables over a dataset (the same JSON as GET /dataset)."""
import math


class DatasetIndex:
    def __init__(self, ds: dict):
        self.ds = ds
        by_id = lambda items: {i["id"]: i for i in items}
        self.teachers = by_id(ds["teachers"])
        self.rooms = by_id(ds["rooms"])
        self.groups = by_id(ds["groups"])
        self.streams = by_id(ds["streams"])
        self.subjects = by_id(ds["subjects"])
        self.assignments = by_id(ds["assignments"])

    # -- audiences
    def cohorts(self, aud: dict) -> list[tuple[str, int | None]]:
        """A slice of students: (group id, subgroup) with subgroup None for the whole group."""
        if aud["kind"] == "stream":
            return [(g, None) for g in self.streams.get(aud["id"], {}).get("groupIds", [])]
        if aud["kind"] == "group":
            return [(aud["id"], None)]
        return [(aud["id"], aud["subgroup"])]

    def audience_size(self, aud: dict) -> int:
        if aud["kind"] == "stream":
            return sum(self.groups.get(g, {}).get("size", 0) for g, _ in self.cohorts(aud))
        g = self.groups.get(aud["id"])
        if not g:
            return 0
        if aud["kind"] == "group":
            return g["size"]
        return math.ceil(g["size"] / max(1, g["subgroups"]))

    def audience_touches_group(self, aud: dict, group_id: str) -> bool:
        return any(g == group_id for g, _ in self.cohorts(aud))

    def audiences_overlap(self, a: dict, b: dict) -> bool:
        cb = self.cohorts(b)
        return any(
            gx == gy and (sx is None or sy is None or sx == sy)
            for gx, sx in self.cohorts(a)
            for gy, sy in cb
        )

    # -- days, shifts, limits
    def group_days(self, group_id: str) -> list[int]:
        s = self.ds["settings"]
        form = self.groups.get(group_id, {}).get("studyForm", "full")
        return [d for d in s.get("formDays", {}).get(form, []) if d < s["workingDays"]]

    def group_shift(self, group_id: str) -> dict | None:
        group = self.groups.get(group_id) or {}
        s = self.ds["settings"]
        shifts = (s.get("masterYearShifts") if group.get("cycle") == "master" else s.get("yearShifts")) or []
        if not shifts:
            return None
        return shifts[min(group.get("year", 1), len(shifts)) - 1]

    def shift_distance(self, assignment: dict, slot: int) -> int:
        d = 0
        for gid, _ in self.cohorts(assignment["audience"]):
            s = self.group_shift(gid)
            if s:
                d += s["first"] - slot if slot < s["first"] else slot - s["last"] if slot > s["last"] else 0
        return d

    def group_max_pairs(self, group_id: str) -> int:
        s = self.ds["settings"]
        form = self.groups.get(group_id, {}).get("studyForm", "full")
        return s.get("formMaxPairs", {}).get(form, s["maxPairsPerDayGroup"])

    def is_reduced(self, assignment: dict) -> bool:
        cohorts = self.cohorts(assignment["audience"])
        return bool(cohorts) and all(self.groups.get(g, {}).get("studyForm") == "reduced" for g, _ in cohorts)

    def required_pairs(self, a: dict) -> float:
        if not self.is_reduced(a):
            return a["pairsPerWeek"]
        per = a.get("pairsPerSession")
        per = a["pairsPerWeek"] if per is None else per
        return per * len(self.ds["settings"].get("reducedSessions", []))

    def allowed_days(self, a: dict) -> list[int]:
        lists = [self.group_days(g) for g, _ in self.cohorts(a["audience"])]
        if not lists:
            return []
        out = lists[0]
        for l in lists[1:]:
            out = [d for d in out if d in l]
        return out

    def preferred_rooms(self, a: dict) -> list[dict]:
        groups = [g for g, _ in self.cohorts(a["audience"])]
        return [
            r
            for r in self.ds["rooms"]
            if a["subjectId"] in (r.get("preferredSubjectIds") or []) or any(g in groups for g in (r.get("preferredGroupIds") or []))
        ]

    def assignment_of(self, lesson: dict) -> dict | None:
        return self.assignments.get(lesson["assignmentId"])

    @staticmethod
    def room_fits(assignment: dict, room: dict) -> bool:
        """Seminars can fall back to lecture halls."""
        if assignment["roomType"] == "seminar":
            return room["type"] in ("seminar", "lecture")
        return room["type"] == assignment["roomType"]

    @staticmethod
    def has_equipment(assignment: dict, room: dict) -> bool:
        return all(e in room["equipment"] for e in assignment["equipment"])
