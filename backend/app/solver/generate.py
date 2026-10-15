"""Timetable generation (report, section 2.3): CP-SAT builds a complete timetable (Algorithm 1), then Large
Neighborhood Search improves it (Algorithm 2): free a part of the timetable chosen by a domain strategy (random,
by day, by teacher, by group), let CP-SAT place those pairs again around the rest, keep the result when it is
not worse, and widen the neighbourhood when nothing improves.

Pairs the administrator locked stay exactly where they are, other groups' published pairs stay booked and are
returned with the result, and reduced-attendance groups get their dated session pairs at the end.

No database in here: the function takes the dataset (the JSON of GET /dataset) and returns lessons, so it can
be tested on its own."""
import random
import time
from dataclasses import dataclass
from typing import Callable

from ..domain.indexes import DatasetIndex
from ..domain.score import score_timetable, weights_for
from ..domain.weeks import WeekNeed, week_need
from .absolute import Rules, enforce, violation_group_days
from .greedy import adopt_example, construct
from .model import Placement
from .model import solve_weekly as _solve_weekly
from .sessions import place_sessions

Progress = Callable[[float, dict], None]


def solve_weekly(*args, **kwargs):
    """The weekly model without rooms in it (they are matched afterwards): a few dozen times fewer variables, so a whole
    faculty gets solved in a short run. Tests of the model itself use the exact one (rooms in it)."""
    return _solve_weekly(*args, match_rooms=True, **kwargs)


@dataclass
class Generated:
    lessons: list[dict]
    score: dict
    seed: int
    seconds: float
    steps: int  # LNS steps tried
    improved: int  # LNS steps that found something not worse
    missing: float  # pairs per week the solver could not place (contradictory data); 0.5 = one odd or even week


EXAMPLE_WEIGHT = 2  # search cost of moving one pair away from the example timetable (= a missed preferred room)
DROP_COST = 3000  # search cost of leaving a pair out when a rule is absolute (a day that breaks one costs 10 000)


def _better(x: dict, y: dict) -> bool:
    """Not worse: fewer hard problems, or the same and a soft score that is not higher."""
    return x["hard"] < y["hard"] or (x["hard"] == y["hard"] and x["soft"] <= y["soft"])


def in_semester(idx: DatasetIndex, a: dict | None, semester: int | None) -> bool:
    """Is the load's subject taught in that semester of the year (1 or 2; a subject without one is in the 1st)?
    Any semester when none is asked for."""
    if semester is None or a is None:
        return True
    return (idx.subjects.get(a["subjectId"], {}).get("semester") or 1) == semester


def term_semester(ds: dict) -> int:
    """The semester of the year (1 = autumn, 2 = spring) the current term is in."""
    return 2 if str(ds["settings"].get("semester", "")).startswith("Primăvara") else 1


def timetable_semester(ds: dict, idx: DatasetIndex, lessons: list[dict]) -> int:
    """The semester a timetable is for: the one most of its pairs belong to (the term's when it has none yet or they tie)."""
    counts = {1: 0, 2: 0}
    for l in lessons:
        a = idx.assignment_of(l)
        if a:
            counts[2 if (idx.subjects.get(a["subjectId"], {}).get("semester") or 1) == 2 else 1] += 1
    return term_semester(ds) if counts[1] == counts[2] else (2 if counts[2] > counts[1] else 1)


def scope_assignments(ds: dict, idx: DatasetIndex, group_ids: list[str], semester: int | None = None) -> list[dict]:
    chosen = set(group_ids)
    return [a for a in ds["assignments"] if any(g in chosen for g, _ in idx.cohorts(a["audience"])) and in_semester(idx, a, semester)]


def clusters_of(idx: DatasetIndex, loads: list[dict]) -> list[list[dict]]:
    """The loads split into clusters that share no student group (a stream joins its groups): each cluster is a problem
    of its own, linked to the others only through teachers and rooms."""
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a in loads:
        gs = [g for g, _ in idx.cohorts(a["audience"])]
        for g in gs[1:]:
            parent[find(g)] = find(gs[0])
        if gs:
            find(gs[0])
    out: dict[str, list[dict]] = {}
    for a in loads:
        gs = [g for g, _ in idx.cohorts(a["audience"])]
        out.setdefault(find(gs[0]) if gs else a["id"], []).append(a)
    return sorted(out.values(), key=len, reverse=True)


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
    example: list[dict] | None = None,
    semester: int | None = None,
    rules: dict | None = None,
) -> Generated:
    started = time.monotonic()
    idx = DatasetIndex(ds)
    weights = weights_for(rules)  # what the search minimises; the score saved with the timetable uses the usual weights
    rng = random.Random(seed)
    new_id = _Ids()
    scoped = scope_assignments(ds, idx, group_ids, semester)
    scoped_ids = {a["id"] for a in scoped}
    # pairs of other groups stay booked, but only those of the semester being generated: the other semester's
    # timetable does not use the rooms and teachers of this one
    keep = [dict(l) for l in (keep or []) if l["assignmentId"] not in scoped_ids and in_semester(idx, idx.assignment_of(l), semester)]
    locked = [dict(l) for l in (fixed or []) if l["assignmentId"] in scoped_ids and not l.get("date")]
    weekly = [a for a in scoped if not idx.is_reduced(a)]
    reduced = [a for a in scoped if idx.is_reduced(a)]
    weekly_ids = {a["id"] for a in weekly}
    weekly_ds = {**ds, "assignments": weekly}
    deadline = started + seconds

    def tick(p: float, score: dict) -> None:
        if progress:
            progress(min(1.0, max(0.0, p)), score)

    def deficits(lessons: list[dict]) -> dict[str, WeekNeed]:
        """What each weekly load still needs, in odd and in even weeks (an odd-week pair taken out is needed again
        in odd weeks; a load of 0.5 needs one pair in either)."""
        own: dict[str, list[dict]] = {}
        for l in lessons:
            if not l.get("date"):
                own.setdefault(l["assignmentId"], []).append(l)
        out = {}
        for a in weekly:
            n = week_need(a["pairsPerWeek"], own.get(a["id"], []))
            if n:
                out[a["id"]] = n
        return out

    def as_lessons(ps: list[Placement]) -> list[dict]:
        return [p.as_lesson(new_id()) for p in ps]

    # ---- an example timetable to follow: its pairs first, where they were (they may still move later)
    base = keep + locked
    adopted = as_lessons(adopt_example(ds, idx, deficits(locked), base, example or []))
    example_at: dict[tuple, int] = {}
    for l in example or []:
        if not l.get("date"):
            k = (l["assignmentId"], l["day"], l["slot"])
            example_at[k] = example_at.get(k, 0) + 1

    def away(ls: list[dict]) -> int:
        """Pairs not where the example has them (0 without an example)."""
        if not example_at:
            return 0
        left = dict(example_at)
        n = 0
        for l in ls:
            k = (l["assignmentId"], l["day"], l["slot"])
            if left.get(k, 0) > 0:
                left[k] -= 1
            elif l["id"] not in keep_ids and not l.get("date"):
                n += 1
        return n

    def judged(sc: dict, ls: list[dict]) -> tuple[float, float]:
        """(hard problems, soft cost). With absolute rules a pair left out costs DROP_COST instead of being a hard problem:
        leaving it out is allowed when that cures a day that breaks a rule, which is worth far more."""
        if not absolute:
            return sc["hard"], sc["soft"]
        d = deficits(ls)
        return sc["hard"] - len(d), sc["soft"] + DROP_COST * sum(n.halves for n in d.values()) / 2

    def accept(cand: dict, cand_ls: list[dict], cur: dict, cur_ls: list[dict]) -> bool:
        """Not worse; with an example, leaving it costs EXAMPLE_WEIGHT per pair."""
        (ch, cs), (uh, us) = judged(cand, cand_ls), judged(cur, cur_ls)
        if example_at:
            cs, us = cs + EXAMPLE_WEIGHT * away(cand_ls), us + EXAMPLE_WEIGHT * away(cur_ls)
        return ch < uh or (ch == uh and cs <= us)

    keep_ids = {l["id"] for l in keep}
    absolute = Rules(rules)  # no gaps / the minimum pairs per day, when they are absolute: repaired first, then enforced
    base = base + adopted
    # ---- starting point: a quick heuristic timetable, so there is always a complete answer to improve
    todo = deficits(locked + adopted)
    start = as_lessons(construct(ds, idx, todo, base, rng))
    lessons = base + start
    score = score_timetable(weekly_ds, lessons, idx, weights)
    tick(0.02, score)

    # ---- Algorithm 1: one CP-SAT model for the whole weekly timetable, started from that solution
    first = solve_weekly(ds, idx, todo, base, max(1.0 if absolute else 2.0, seconds * (0.1 if absolute else initial_share)), seed, workers,
                         hint=[Placement(l["assignmentId"], l["day"], l["slot"], l["roomId"], l["parity"]) for l in start], weights=weights)
    if first.status in ("OPTIMAL", "FEASIBLE"):
        candidate = base + as_lessons(first.placements)
        cand_score = score_timetable(weekly_ds, candidate, idx, weights)
        if accept(cand_score, candidate, score, lessons):  # never worse than the heuristic
            lessons, score = candidate, cand_score
    tick(initial_share, score)

    # what still breaks an absolute rule loses its pairs now, so the search below spends its time putting them back
    # without breaking one (accept() prefers a placed pair over a missing one only when no rule is broken)
    protected = keep_ids | {l["id"] for l in lessons if l.get("locked")}
    if absolute:
        lessons = enforce(weekly_ds, idx, lessons, absolute, protected)
        score = score_timetable(weekly_ds, lessons, idx, weights)
        # ---- refill: the pairs taken out are placed again, cluster by cluster, around everything else, with the rules as
        # constraints of the model. Everything else is fixed, so each of these is a small problem.
        refill_until = started + seconds * 0.6
        for _ in range(8):
            by_cluster = [(c, {aid: n for aid, n in deficits(lessons).items() if aid in {a["id"] for a in c}}) for c in clusters_of(idx, weekly)]
            todo_clusters = sorted((x for x in by_cluster if x[1]), key=lambda x: -sum(n.halves for n in x[1].values()))
            for i, (cluster, need) in enumerate(todo_clusters):
                left = refill_until - time.monotonic()
                if left < 1.0:
                    break
                res = solve_weekly(ds, idx, need, lessons, min(8.0, max(1.5, left / (len(todo_clusters) - i))), rng.randrange(1 << 30), workers,
                                   weights=weights, jitter=False, hard_gaps=absolute.gaps, hard_thin=absolute.thin)
                if res.status not in ("OPTIMAL", "FEASIBLE"):
                    continue
                candidate = lessons + as_lessons(res.placements)
                cand_score = score_timetable(weekly_ds, candidate, idx, weights)
                if accept(cand_score, candidate, score, lessons):
                    lessons, score = candidate, cand_score
            if not any(need for _, need in by_cluster) or refill_until - time.monotonic() < 1.0:
                break

    # ---- a pair that still has no place: all the pairs of its student groups are planned again together (a pair
    # that fits nowhere around the others often fits once they move too), with the rules as constraints
    if absolute:
        widen_until = started + seconds * 0.95
        for _ in range(3):
            still = list(deficits(lessons))
            if not still or widen_until - time.monotonic() < 1.0:
                break
            for aid in still:
                left = widen_until - time.monotonic()
                if left < 1.0:
                    break
                if aid not in deficits(lessons):
                    continue
                gs = {g for g, _ in idx.cohorts(idx.assignments[aid]["audience"])}
                destroyed = [l for l in lessons if not l.get("locked") and l["id"] not in keep_ids and not l.get("date") and l["assignmentId"] in weekly_ids
                             and gs & {g for g, _ in idx.cohorts(idx.assignment_of(l)["audience"])}]
                gone = {l["id"] for l in destroyed}
                rest = [l for l in lessons if l["id"] not in gone]
                res = solve_weekly(ds, idx, deficits(rest), rest, max(1.0, min(10.0, left)), rng.randrange(1 << 30), workers, weights=weights, jitter=False,
                                   hint=[Placement(l["assignmentId"], l["day"], l["slot"], l["roomId"], l["parity"]) for l in destroyed],
                                   hard_gaps=absolute.gaps, hard_thin=absolute.thin)
                if res.status not in ("OPTIMAL", "FEASIBLE"):
                    continue
                candidate = rest + as_lessons(res.placements)
                cand_score = score_timetable(weekly_ds, candidate, idx, weights)
                if accept(cand_score, candidate, score, lessons):
                    lessons, score = candidate, cand_score

    # ---- Algorithm 2: Large Neighborhood Search with CP-SAT as the repair step
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
            thin = violation_group_days(weekly_ds, idx, lessons, absolute) if absolute else []
            if thin and rng.random() < 0.6:
                strategy = "byThin"  # a group with a day below the minimum: plan all its pairs again together
            pivot = rng.choice(movable)
            pa = idx.assignment_of(pivot)
            pool = movable
            if strategy == "byThin":
                gid, _day = rng.choice(thin)
                pool = [l for l in movable if idx.audience_touches_group(idx.assignment_of(l)["audience"], gid)] or movable
            elif strategy == "byDay":
                pool = [l for l in movable if l["day"] == pivot["day"]]
            elif strategy == "byTeacher":
                pool = [l for l in movable if idx.share_teacher(idx.assignment_of(l), pa)]
            elif strategy == "byGroup":
                g = idx.cohorts(pa["audience"])[0][0]
                pool = [l for l in movable if idx.audience_touches_group(idx.assignment_of(l)["audience"], g)]
            destroyed = rng.sample(pool, min(k + 10 if strategy == "byThin" else k, len(pool)))
        gone = {l["id"] for l in destroyed}
        rest = [l for l in lessons if l["id"] not in gone]
        need = deficits(rest)
        if absolute:
            freed = {l["assignmentId"] for l in destroyed}
            need = {aid: n for aid, n in need.items() if aid in freed}
        steps += 1
        budget = min(repair_seconds, deadline - time.monotonic())
        res = solve_weekly(ds, idx, need, rest, budget, rng.randrange(1 << 30), workers,
                           hint=[Placement(l["assignmentId"], l["day"], l["slot"], l["roomId"], l["parity"]) for l in destroyed], jitter=False, weights=weights,
                           hard_gaps=absolute.gaps, hard_thin=absolute.thin)
        if res.status not in ("OPTIMAL", "FEASIBLE"):
            stale += 1
        else:
            candidate = rest + as_lessons(res.placements)
            cand_score = score_timetable(weekly_ds, candidate, idx, weights)
            if accept(cand_score, candidate, score, lessons):
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

    # ---- the guarantee: whatever still breaks an absolute rule loses its pairs (they are reported as missing)
    lessons = enforce(weekly_ds, idx, lessons, absolute, protected)

    # ---- reduced attendance: dated session pairs around everything else
    if reduced:
        lessons = lessons + place_sessions(ds, idx, reduced, lessons, rng, new_id, example)
    final = score_timetable({**ds, "assignments": scoped}, lessons, idx)
    tick(1.0, final)
    return Generated(lessons, final, seed, time.monotonic() - started, steps, improved, sum(n.halves for n in deficits(lessons).values()) / 2)
