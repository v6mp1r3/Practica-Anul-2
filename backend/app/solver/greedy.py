"""A fast constructive heuristic (port of Builder.place in frontend/src/domain/generator.ts): hardest loads first,
each pair goes to the cheapest free (day, slot, room). It takes milliseconds and gives CP-SAT a complete starting
point (the "valid initial solution" the LNS of the report needs), so even a short time budget returns a timetable
that satisfies the hard constraints whenever one is easy to find. What it cannot place is left for CP-SAT."""
import math
import random
from collections import defaultdict

from ..domain.indexes import DatasetIndex, teacher_ids
from ..domain.slots import slot_key
from ..domain.weeks import WeekNeed
from .model import WEEKS, Placement, as_need


def _difficulty(a: dict, idx: DatasetIndex) -> float:
    return idx.audience_size(a["audience"]) / 10 + (4 if a["type"] == "lab" else 0) + len(idx.teacher_unavailable(a)) / 3 + len(a["equipment"]) * 2


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

    def _keys(self, a: dict, d: int, s: int, room_id: str, parity: str = "weekly"):
        for w in (WEEKS if parity not in WEEKS else (parity,)):
            for t in teacher_ids(a):
                yield ("t", t, d, s, w)
            yield ("r", room_id, d, s, w)
            for g, sub in self.idx.cohorts(a["audience"]):
                for p in (self.points[g] if sub is None else (sub,)):
                    yield ("g", g, p, d, s, w)

    def free(self, a: dict, d: int, s: int, room_id: str, parity: str = "weekly") -> bool:
        return not any(k in self.used for k in self._keys(a, d, s, room_id, parity))

    def add(self, a: dict, d: int, s: int, room_id: str, parity: str = "weekly") -> None:
        self.used.update(self._keys(a, d, s, room_id, parity))
        for t in teacher_ids(a):
            self.teacher_slots[(t, d)].append(s)
        for g, _ in self.idx.cohorts(a["audience"]):
            self.group_slots[(g, d)].append(s)
            self.subject_days.add((g, d, a["subjectId"]))


def _tasks(n: WeekNeed) -> list[tuple[str, ...]]:
    """The pairs to place, each with the weeks it may take: every week, odd only, even only, or odd or even."""
    w = n.weekly
    return [("weekly",)] * w + [("odd",)] * (n.odd - w) + [("even",)] * (n.even - w) + [("odd", "even")] * n.either


def take(n: WeekNeed, parity: str) -> WeekNeed | None:
    """What is left after placing a pair of that parity, or None if the load does not need it."""
    if parity == "weekly":
        return WeekNeed(n.odd - 1, n.even - 1, n.either) if n.odd > 0 and n.even > 0 else None
    mine = n.odd if parity == "odd" else n.even
    if mine > 0:
        return WeekNeed(n.odd - 1, n.even, n.either) if parity == "odd" else WeekNeed(n.odd, n.even - 1, n.either)
    if n.either > 0:
        return WeekNeed(n.odd, n.even, n.either - 1)
    return None


def construct(ds: dict, idx: DatasetIndex, need: dict, fixed: list[dict], rng: random.Random) -> list[Placement]:
    """Place what each load needs (`need[a]`: a number of weekly pairs or a WeekNeed) around `fixed`; pairs that
    fit nowhere are simply not placed."""
    need = {a: as_need(v) for a, v in need.items()}
    settings = ds["settings"]
    n_slots = len(settings["slots"])
    busy = _Busy(idx)
    for f in fixed:
        a = idx.assignment_of(f)
        if a and not f.get("date"):
            busy.add(a, f["day"], f["slot"], f["roomId"], f.get("parity", "weekly"))
    shifted = bool(settings.get("yearShifts"))
    order = [a for a in idx.assignments.values() if need.get(a["id"])]
    rng.shuffle(order)
    order.sort(key=lambda a: -_difficulty(a, idx))
    out: list[Placement] = []
    for a in order:
        teacher = idx.teachers.get(a["teacherId"], {})
        unavailable = idx.teacher_unavailable(a)
        size = idx.audience_size(a["audience"])
        preferred = {r["id"] for r in idx.preferred_rooms(a)}
        rooms = sorted(
            (r for r in ds["rooms"] if r["capacity"] >= size and idx.room_fits(a, r) and idx.has_equipment(a, r)),
            key=lambda r: (r["id"] not in preferred, r["capacity"]),
        )
        edge = bool(idx.subjects.get(a["subjectId"], {}).get("edgeOfDay"))
        groups = [g for g, _ in idx.cohorts(a["audience"])]
        for weeks in _tasks(need[a["id"]]):
            best = None
            for d in idx.allowed_days(a):
                for s in range(n_slots):
                    if slot_key(d, s) in unavailable:
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
                    for t in teacher_ids(a):
                        c += 3 * gap_delta(busy.teacher_slots[(t, d)])
                    if slot_key(d, s) in (teacher.get("preferred") or []):
                        c -= 1
                    c += rng.random() * 1.2
                    if best is not None and c >= best[0]:
                        continue
                    for parity in weeks:
                        room = next((r for r in rooms if busy.free(a, d, s, r["id"], parity)), None)
                        if room:
                            best = (c, d, s, room["id"], parity)
                            break
            if best is None:
                break
            _, d, s, room_id, parity = best
            busy.add(a, d, s, room_id, parity)
            out.append(Placement(a["id"], d, s, room_id, parity))
    return out


def adopt_example(ds: dict, idx: DatasetIndex, need: dict, fixed: list[dict], example: list[dict]) -> list[Placement]:
    """An example timetable's pairs where they were (same day and pair; its room, or another that fits),
    as long as that still clashes with nothing and the load still needs the pair."""
    n_slots = len(ds["settings"]["slots"])
    busy = _Busy(idx)
    for f in fixed:
        a = idx.assignment_of(f)
        if a and not f.get("date"):
            busy.add(a, f["day"], f["slot"], f["roomId"], f.get("parity", "weekly"))
    left = {a: as_need(v) for a, v in need.items()}
    out: list[Placement] = []
    for ex in example:
        a = idx.assignments.get(ex["assignmentId"])
        d, s, parity = ex["day"], ex["slot"], ex.get("parity", "weekly")
        rest = take(left[a["id"]], parity) if a and not ex.get("date") and left.get(a["id"]) else None
        if rest is None:
            continue
        if s >= n_slots or d not in idx.allowed_days(a) or slot_key(d, s) in idx.teacher_unavailable(a):
            continue
        size = idx.audience_size(a["audience"])
        ok = [r for r in ds["rooms"] if r["capacity"] >= size and idx.room_fits(a, r) and idx.has_equipment(a, r)]
        ok.sort(key=lambda r: (r["id"] != ex["roomId"], r["capacity"]))
        room = next((r for r in ok if busy.free(a, d, s, r["id"], parity)), None)
        if room is None:
            continue
        busy.add(a, d, s, room["id"], parity)
        out.append(Placement(a["id"], d, s, room["id"], parity))
        left[a["id"]] = rest
    return out
