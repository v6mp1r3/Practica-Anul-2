"""Rooms for the pairs the model placed without one (`solve_weekly(match_rooms=True)`).

At each day and pair, every placed pair needs a room it can use (capacity, type, equipment), a room is in one place at
a time in odd and in even weeks, and a pair that runs every week keeps the same room in both. That is a bipartite
matching: pairs on one side, free rooms on the other. The model's capacity rule per kind of room makes it solvable in
nearly every case; a pair that finds no room is left out here (the generator then counts it as missing and places it
again elsewhere), so the result never has two pairs in one room.
"""
from collections import defaultdict

from ..domain.indexes import DatasetIndex
from .model import WEEKS_OF, Placement


def _match(pairs: list[Placement], options: dict[int, list[str]]) -> dict[int, str]:
    """Kuhn's augmenting paths. `options[i]` are the rooms pair i may take, best first. Returns pair index -> room."""
    owner: dict[str, int] = {}

    def try_pair(i: int, seen: set[str]) -> bool:
        for room in options[i]:
            if room in seen:
                continue
            seen.add(room)
            if room not in owner or try_pair(owner[room], seen):
                owner[room] = i
                return True
        return False

    for i in sorted(range(len(pairs)), key=lambda i: len(options[i])):  # the most restricted pair first
        try_pair(i, set())
    return {i: room for room, i in owner.items()}


def assign_rooms(ds: dict, idx: DatasetIndex, placed: list[Placement], fixed: list[dict], eligible: dict[str, frozenset]) -> list[Placement]:
    """The placements with a room each; a pair no room can be found for is left out."""
    rooms = {r["id"]: r for r in ds["rooms"]}
    taken: dict[tuple, set[str]] = defaultdict(set)  # (day, pair, week) -> rooms the fixed pairs use
    for f in fixed:
        for w in WEEKS_OF[f.get("parity", "weekly")]:
            taken[(f["day"], f["slot"], w)].add(f["roomId"])
    preferred = {a_id: {r["id"] for r in idx.preferred_rooms(idx.assignments[a_id])} for a_id in eligible}

    def order(a_id: str, candidates: set[str]) -> list[str]:
        """A preferred ("de dorit") room first, then the smallest that fits."""
        return sorted(candidates, key=lambda r: (r not in preferred.get(a_id, ()), rooms[r]["capacity"], r))

    at: dict[tuple[int, int], list[Placement]] = defaultdict(list)
    for p in placed:
        at[(p.day, p.slot)].append(p)
    out: list[Placement] = []
    for (d, s), ps in at.items():
        used = {"odd": set(), "even": set()}
        busy = {w: taken.get((d, s, w), set()) for w in ("odd", "even")}
        for parity in ("weekly", "odd", "even"):
            group = [p for p in ps if p.parity == parity]
            if not group:
                continue
            weeks = WEEKS_OF[parity]
            options = {}
            for i, p in enumerate(group):
                free = set(eligible[p.assignmentId])
                for w in weeks:
                    free -= busy[w] | used[w]
                options[i] = order(p.assignmentId, free)
            for i, room in _match(group, options).items():
                p = group[i]
                out.append(Placement(p.assignmentId, p.day, p.slot, room, p.parity))
                for w in weeks:
                    used[w].add(room)
    return out
