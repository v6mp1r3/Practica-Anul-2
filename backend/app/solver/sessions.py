"""Reduced attendance ("frecventa redusa") is taught in sessions on real dates. Port of
frontend/src/domain/sessions.ts: each load gets its session pairs in blocks of up to 3 consecutive pairs,
placed around every other pair so no teacher, room or group is double-booked."""
import random
from collections import defaultdict
from datetime import date, timedelta

from ..domain.indexes import DatasetIndex
from ..domain.slots import lessons_overlap, slot_key

MAX_BLOCK = 3


def session_dates(start: str, end: str, days: list[int]) -> list[str]:
    out, d, last = [], date.fromisoformat(start), date.fromisoformat(end)
    while d <= last:
        if d.weekday() in days:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


class _Board:
    def __init__(self, idx: DatasetIndex, lessons: list[dict]):
        self.idx = idx
        self.by_slot: dict[str, list[dict]] = defaultdict(list)
        self.by_date_group: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for l in lessons:
            self.add(l)

    def add(self, l: dict) -> None:
        self.by_slot[slot_key(l["day"], l["slot"])].append(l)
        if l.get("date"):
            a = self.idx.assignment_of(l)
            if a:
                for g, _ in self.idx.cohorts(a["audience"]):
                    self.by_date_group[(l["date"], g)].append(l)

    def clashes(self, l: dict, a: dict) -> bool:
        for o in self.by_slot.get(slot_key(l["day"], l["slot"]), ()):
            if not lessons_overlap(o, l):
                continue
            b = self.idx.assignment_of(o)
            if b and (b["teacherId"] == a["teacherId"] or o["roomId"] == l["roomId"] or self.idx.audiences_overlap(a["audience"], b["audience"])):
                return True
        return False

    def group_slots(self, d: str, group_id: str) -> list[int]:
        return [o["slot"] for o in self.by_date_group.get((d, group_id), ())]

    def subject_on_date(self, d: str, subject_id: str, group_id: str) -> bool:
        return any((self.idx.assignment_of(o) or {}).get("subjectId") == subject_id for o in self.by_date_group.get((d, group_id), ()))


def place_sessions(ds: dict, idx: DatasetIndex, loads: list[dict], existing: list[dict], rng: random.Random, new_id) -> list[dict]:
    board = _Board(idx, existing)
    placed: list[dict] = []
    settings = ds["settings"]
    n_slots = len(settings["slots"])
    vacations = ((settings.get("evaluation") or {}).get("vacations")) or []
    for session in settings.get("reducedSessions") or []:
        order = list(loads)
        rng.shuffle(order)
        order.sort(key=lambda a: (-(a.get("pairsPerSession") if a.get("pairsPerSession") is not None else a["pairsPerWeek"]), -int(a["type"] == "lab")))
        for a in order:
            group_ids = [g for g, _ in idx.cohorts(a["audience"])]
            dates = [d for d in session_dates(session["start"], session["end"], idx.allowed_days(a)) if not any(v["start"] <= d <= v["end"] for v in vacations)]
            if not dates:
                continue
            teacher = idx.teachers.get(a["teacherId"], {})
            size = idx.audience_size(a["audience"])
            preferred = {r["id"] for r in idx.preferred_rooms(a)}
            rooms = [r for r in ds["rooms"] if r["capacity"] >= size and idx.room_fits(a, r) and idx.has_equipment(a, r)]
            rooms.sort(key=lambda r: (r["id"] not in preferred, r["capacity"]))
            max_per_day = min(idx.group_max_pairs(g) for g in group_ids)
            remaining = a.get("pairsPerSession") if a.get("pairsPerSession") is not None else a["pairsPerWeek"]
            while remaining > 0:
                best = None
                k = min(MAX_BLOCK, int(remaining))
                while k >= 1 and best is None:
                    for d in dates:
                        day = date.fromisoformat(d).weekday()
                        taken = [s for g in group_ids for s in board.group_slots(d, g)]
                        if len(set(taken)) + k > max_per_day:
                            continue
                        for start in range(0, n_slots - k + 1):
                            slots = list(range(start, start + k))
                            if any(slot_key(day, s) in teacher.get("unavailable", []) or s in taken for s in slots):
                                continue
                            cost = 0.0
                            if taken:
                                lo, hi = min(taken), max(taken)
                                gap = start - hi - 1 if start > hi else (lo - (start + k - 1) - 1 if lo > start + k - 1 else 0)
                                cost += gap * 10
                            cost += len(set(taken)) * 1.2
                            cost += sum(idx.shift_distance(a, s) for s in slots) * 1.5
                            if any(board.subject_on_date(d, a["subjectId"], g) for g in group_ids):
                                cost += 3
                            cost += rng.random() * 0.6
                            if best and cost >= best["cost"]:
                                continue
                            room = next((r for r in rooms if all(not board.clashes({"id": "", "assignmentId": a["id"], "day": day, "slot": s, "roomId": r["id"], "parity": "weekly", "date": d}, a) for s in slots)), None)
                            if room:
                                best = {"date": d, "start": start, "k": k, "roomId": room["id"], "cost": cost}
                    k -= 1
                if not best:
                    break  # nothing fits: the validator reports the missing pairs
                for i in range(best["k"]):
                    l = {"id": new_id(), "assignmentId": a["id"], "day": date.fromisoformat(best["date"]).weekday(), "slot": best["start"] + i,
                         "roomId": best["roomId"], "parity": "weekly", "date": best["date"]}
                    board.add(l)
                    placed.append(l)
                remaining -= best["k"]
    return placed
