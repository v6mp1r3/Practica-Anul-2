"""A fast constructive heuristic (port of Builder.place in frontend/src/domain/generator.ts): hardest loads first,
each pair goes to the cheapest free (day, slot, room). It takes milliseconds and gives CP-SAT a complete starting
point (the "valid initial solution" the LNS of the report needs), so even a short time budget returns a timetable
that satisfies the hard constraints whenever one is easy to find. What it cannot place is left for CP-SAT."""
import math
import random
from collections import defaultdict

from ..domain.indexes import DatasetIndex
from ..domain.slots import slot_key
from .model import WEEKS, Placement


def _difficulty(a: dict, idx: DatasetIndex) -> float:
    t = idx.teachers.get(a["teacherId"], {})
    return idx.audience_size(a["audience"]) / 10 + (4 if a["type"] == "lab" else 0) + len(t.get("unavailable", [])) / 3 + len(a["equipment"]) * 2


class _Busy:
    """Who is busy when, per odd/even week (the same "at most one" rules as the model)."""

    def __init__(self, idx: DatasetIndex):
        self.idx = idx
        self.used: set[tuple] = set()
        self.points: dict[str, set[int]] = defaultdict(lambda: {0})
        for a in idx.assignments.values():
            for g, sub in idx.cohorts(a["audience"]):
                if sub is not None:
                    self.points[g].add(sub)
        self.group_slots: dict[tuple[str, int], list[int]] = defaultdict(list)
        self.teacher_slots: dict[tuple[str, int], list[int]] = defaultdict(list)
        self.subject_days: set[tuple[str, int, str]] = set()

    def _keys(self, a: dict, d: int, s: int, room_id: str):
        for w in WEEKS:
            yield ("t", a["teacherId"], d, s, w)
            yield ("r", room_id, d, s, w)
            for g, sub in self.idx.cohorts(a["audience"]):
                for p in (self.points[g] if sub is None else (sub,)):
                    yield ("g", g, p, d, s, w)

    def free(self, a: dict, d: int, s: int, room_id: str) -> bool:
        return not any(k in self.used for k in self._keys(a, d, s, room_id))

    def add(self, a: dict, d: int, s: int, room_id: str) -> None:
        self.used.update(self._keys(a, d, s, room_id))
        self.teacher_slots[(a["teacherId"], d)].append(s)
        for g, _ in self.idx.cohorts(a["audience"]):
            self.group_slots[(g, d)].append(s)
            self.subject_days.add((g, d, a["subjectId"]))


def construct(ds: dict, idx: DatasetIndex, need: dict[str, int], fixed: list[dict], rng: random.Random) -> list[Placement]:
    """Place `need[a]` pairs of each load around `fixed`; pairs that fit nowhere are simply not placed."""
    settings = ds["settings"]
    n_slots = len(settings["slots"])
    busy = _Busy(idx)
    for f in fixed:
        a = idx.assignment_of(f)
        if a and not f.get("date"):
            busy.add(a, f["day"], f["slot"], f["roomId"])
    shifted = bool(settings.get("yearShifts"))
    order = [a for a in idx.assignments.values() if need.get(a["id"], 0) > 0]
    rng.shuffle(order)
    order.sort(key=lambda a: -_difficulty(a, idx))
    out: list[Placement] = []
    for a in order:
        teacher = idx.teachers.get(a["teacherId"], {})
        size = idx.audience_size(a["audience"])
        preferred = {r["id"] for r in idx.preferred_rooms(a)}
        rooms = sorted(
            (r for r in ds["rooms"] if r["capacity"] >= size and idx.room_fits(a, r) and idx.has_equipment(a, r)),
            key=lambda r: (r["id"] not in preferred, r["capacity"]),
        )
        edge = bool(idx.subjects.get(a["subjectId"], {}).get("edgeOfDay"))
        groups = [g for g, _ in idx.cohorts(a["audience"])]
        for _ in range(need[a["id"]]):
            best = None
            for d in idx.allowed_days(a):
                for s in range(n_slots):
                    if slot_key(d, s) in teacher.get("unavailable", []):
                        continue
                    c = 4 * idx.shift_distance(a, s)
                    if not shifted:
                        c += (1.5 if s == 0 else 0) + (1 if s >= n_slots - 1 else 0)

                    def gap_delta(slots: list[int]) -> int:
                        if not slots:
                            return 0
                        lo, hi = min(slots), max(slots)
                        return lo - s - 1 if s < lo else (s - hi - 1 if s > hi else -1)

                    for g in groups:
                        slots = busy.group_slots[(g, d)]
                        c += 10 * gap_delta(slots)
                        if edge and slots and min(slots) < s < max(slots):
                            c += 12
                        if len(set(slots)) >= idx.group_max_pairs(g):
                            c += 6
                        if (g, d, a["subjectId"]) in busy.subject_days:
                            c += 3
                    c += 3 * gap_delta(busy.teacher_slots[(a["teacherId"], d)])
                    if slot_key(d, s) in (teacher.get("preferred") or []):
                        c -= 1
                    c += rng.random() * 1.2
                    if best is not None and c >= best[0]:
                        continue
                    room = next((r for r in rooms if busy.free(a, d, s, r["id"])), None)
                    if room:
                        best = (c, d, s, room["id"])
            if best is None:
                break
            _, d, s, room_id = best
            busy.add(a, d, s, room_id)
            out.append(Placement(a["id"], d, s, room_id, "weekly"))
    return out
