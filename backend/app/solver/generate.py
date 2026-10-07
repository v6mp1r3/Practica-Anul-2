"""Timetable generation (report, section 2.3): CP-SAT builds a complete timetable (Algorithm 1), then Large
Neighborhood Search improves it (Algorithm 2): free a part of the timetable chosen by a domain strategy (random,
by day, by teacher, by group), let CP-SAT place those pairs again around the rest, keep the result when it is
not worse, and widen the neighbourhood when nothing improves.

Pairs the administrator locked stay exactly where they are, other groups' published pairs stay booked and are
returned with the result, and reduced-attendance groups get their dated session pairs at the end.

No database in here: the function takes the dataset (the JSON of GET /dataset) and returns lessons, so it can
be tested on its own."""
import math
import random
import time
from dataclasses import dataclass
from typing import Callable

from ..domain.indexes import DatasetIndex
from ..domain.score import score_timetable
from .greedy import construct
from .model import Placement, solve_weekly
from .sessions import place_sessions

Progress = Callable[[float, dict], None]


@dataclass
class Generated:
    lessons: list[dict]
    score: dict
    seed: int
    seconds: float
    steps: int  # LNS steps tried
    improved: int  # LNS steps that found something not worse
    missing: int  # pairs the solver could not place (contradictory data)


def _better(x: dict, y: dict) -> bool:
    """Not worse: fewer hard problems, or the same and a soft score that is not higher."""
    return x["hard"] < y["hard"] or (x["hard"] == y["hard"] and x["soft"] <= y["soft"])


def scope_assignments(ds: dict, idx: DatasetIndex, group_ids: list[str]) -> list[dict]:
    chosen = set(group_ids)
    return [a for a in ds["assignments"] if any(g in chosen for g, _ in idx.cohorts(a["audience"]))]


class _Ids:
    def __init__(self):
        self.n = 0

    def __call__(self) -> str:
        self.n += 1
        return f"g{self.n}"


def generate_timetable(
    ds: dict,
    group_ids: list[str],
    seed: int,
    seconds: float,
    fixed: list[dict] | None = None,
    keep: list[dict] | None = None,
    progress: Progress | None = None,
    workers: int | None = None,
    initial_share: float = 0.2,
    repair_seconds: float = 2.0,
) -> Generated:
    started = time.monotonic()
    idx = DatasetIndex(ds)
    rng = random.Random(seed)
    new_id = _Ids()
    scoped = scope_assignments(ds, idx, group_ids)
    scoped_ids = {a["id"] for a in scoped}
    keep = [dict(l) for l in (keep or []) if l["assignmentId"] not in scoped_ids]
    locked = [dict(l) for l in (fixed or []) if l["assignmentId"] in scoped_ids and not l.get("date")]
    weekly = [a for a in scoped if not idx.is_reduced(a)]
    reduced = [a for a in scoped if idx.is_reduced(a)]
    weekly_ids = {a["id"] for a in weekly}
    weekly_ds = {**ds, "assignments": weekly}
    deadline = started + seconds

    def tick(p: float, score: dict) -> None:
        if progress:
            progress(min(1.0, max(0.0, p)), score)

    def required(a: dict) -> int:
        return math.ceil(idx.required_pairs(a) - 1e-9)

    def deficits(lessons: list[dict]) -> dict[str, int]:
        have: dict[str, int] = {}
        for l in lessons:
            have[l["assignmentId"]] = have.get(l["assignmentId"], 0) + 1
        return {a["id"]: required(a) - have.get(a["id"], 0) for a in weekly if required(a) - have.get(a["id"], 0) > 0}

    def as_lessons(ps: list[Placement]) -> list[dict]:
        return [p.as_lesson(new_id()) for p in ps]

    # ---- starting point: a quick heuristic timetable, so there is always a complete answer to improve
    base = keep + locked
    todo = deficits(locked)
    start = as_lessons(construct(ds, idx, todo, base, rng))
    lessons = base + start
    score = score_timetable(weekly_ds, lessons, idx)
    tick(0.02, score)

    # ---- Algorithm 1: one CP-SAT model for the whole weekly timetable, started from that solution
    first = solve_weekly(ds, idx, todo, base, max(2.0, seconds * initial_share), seed, workers,
                         hint=[Placement(l["assignmentId"], l["day"], l["slot"], l["roomId"], l["parity"]) for l in start])
    if first.status in ("OPTIMAL", "FEASIBLE"):
        candidate = base + as_lessons(first.placements)
        cand_score = score_timetable(weekly_ds, candidate, idx)
        if _better(cand_score, score):  # never worse than the heuristic
            lessons, score = candidate, cand_score
    tick(initial_share, score)

    # ---- Algorithm 2: Large Neighborhood Search with CP-SAT as the repair step
    keep_ids = {l["id"] for l in keep}
    k = 6
    stale = 0
    steps = improved = 0
    while time.monotonic() < deadline - 0.5:
        movable = [l for l in lessons if not l.get("locked") and l["id"] not in keep_ids and not l.get("date") and l["assignmentId"] in weekly_ids]
        missing_now = deficits(lessons)
        if not movable and not missing_now:
            break
        destroyed: list[dict] = []
        if movable:
            strategy = rng.choice(["random", "byDay", "byTeacher", "byGroup"])
            pivot = rng.choice(movable)
            pa = idx.assignment_of(pivot)
            pool = movable
            if strategy == "byDay":
                pool = [l for l in movable if l["day"] == pivot["day"]]
            elif strategy == "byTeacher":
                pool = [l for l in movable if idx.assignment_of(l)["teacherId"] == pa["teacherId"]]
            elif strategy == "byGroup":
                g = idx.cohorts(pa["audience"])[0][0]
                pool = [l for l in movable if idx.audience_touches_group(idx.assignment_of(l)["audience"], g)]
            destroyed = rng.sample(pool, min(k, len(pool)))
        gone = {l["id"] for l in destroyed}
        rest = [l for l in lessons if l["id"] not in gone]
        need = dict(missing_now)
        for l in destroyed:
            need[l["assignmentId"]] = need.get(l["assignmentId"], 0) + 1
        steps += 1
        budget = min(repair_seconds, deadline - time.monotonic())
        res = solve_weekly(ds, idx, need, rest, budget, rng.randrange(1 << 30), workers,
                           hint=[Placement(l["assignmentId"], l["day"], l["slot"], l["roomId"], l["parity"]) for l in destroyed], jitter=False)
        if res.status not in ("OPTIMAL", "FEASIBLE"):
            stale += 1
        else:
            candidate = rest + as_lessons(res.placements)
            cand_score = score_timetable(weekly_ds, candidate, idx)
            if _better(cand_score, score):
                if cand_score["hard"] < score["hard"] or cand_score["soft"] < score["soft"]:
                    stale, k = 0, 6
                else:
                    stale += 1
                lessons, score = candidate, cand_score
                improved += 1
            else:
                stale += 1
        if stale > 12:  # nothing for a while: free more at once
            k = min(40, k + 4)
            stale = 0
        tick(initial_share + (1 - initial_share) * (time.monotonic() - started - seconds * initial_share) / max(0.001, seconds * (1 - initial_share)), score)

    # ---- reduced attendance: dated session pairs around everything else
    if reduced:
        lessons = lessons + place_sessions(ds, idx, reduced, lessons, rng, new_id)
    final = score_timetable({**ds, "assignments": scoped}, lessons, idx)
    tick(1.0, final)
    return Generated(lessons, final, seed, time.monotonic() - started, steps, improved, sum(deficits(lessons).values()))
