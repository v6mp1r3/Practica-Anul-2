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

from ..domain.indexes import DatasetIndex, teacher_ids
from ..domain.score import score_timetable, weights_for
from ..domain.weeks import WeekNeed, week_need
from .absolute import Rules, find_violations, violation_group_days
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
EMPTY_DAY_COST = 10_000  # search cost of a study day without any pair (a pair left out is a hard problem: it always costs more)


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
        """(hard problems, soft cost). A missing pair is a hard problem and always comes first; a study day without a pair
        (the minimum is absolute) costs EMPTY_DAY_COST."""
        if not absolute.thin:
            return sc["hard"], sc["soft"]
        empty = sum(1 for v in find_violations(weekly_ds, idx, ls, absolute) if v[3] == "empty")
        return sc["hard"], sc["soft"] + EMPTY_DAY_COST * empty

    def accept(cand: dict, cand_ls: list[dict], cur: dict, cur_ls: list[dict]) -> bool:
        """Not worse; with an example, leaving it costs EXAMPLE_WEIGHT per pair."""
        (ch, cs), (uh, us) = judged(cand, cand_ls), judged(cur, cur_ls)
        if example_at:
            cs, us = cs + EXAMPLE_WEIGHT * away(cand_ls), us + EXAMPLE_WEIGHT * away(cur_ls)
        return ch < uh or (ch == uh and cs <= us)

    def complete(until: float, extra: float = 0.0) -> None:
        """No pair may be missing: a rule (no gap, the minimum pairs per day) gives way before a pair does. What is missing is
        placed around everything else; when it does not fit, the pairs of its student groups are planned again together,
        then those of its teachers too, then the whole cluster of groups that share students with them."""
        nonlocal lessons, score

        def missing_total(ls: list[dict]) -> float:
            return sum(n.halves for n in deficits(ls).values()) / 2

        def gone_for(aid: str, level: int) -> list[dict]:
            a = idx.assignments[aid]
            gs = {g for g, _ in idx.cohorts(a["audience"])}
            if level == 3:
                gs = {g for c in clusters_of(idx, weekly) if any(x["id"] == aid for x in c) for x in c for g, _ in idx.cohorts(x["audience"])}
            movable = [l for l in lessons if not l.get("locked") and l["id"] not in keep_ids and not l.get("date") and l["assignmentId"] in weekly_ids]
            return [l for l in movable if gs & {g for g, _ in idx.cohorts(idx.assignment_of(l)["audience"])}
                    or (level == 2 and idx.share_teacher(idx.assignment_of(l), a))]

        for level in range(4):
            todo_ids = [None] if level == 0 else list(deficits(lessons))  # level 0: everything missing at once
            for aid in todo_ids:
                if not deficits(lessons):
                    return
                if aid is not None and aid not in deficits(lessons):
                    continue
                left = until + extra - time.monotonic()
                if left < 2.0:
                    return
                destroyed = [] if aid is None else gone_for(aid, level)
                gone = {l["id"] for l in destroyed}
                rest = [l for l in lessons if l["id"] not in gone]
                res = solve_weekly(ds, idx, deficits(rest), rest, max(3.0, min(20.0, left / 2)), rng.randrange(1 << 30), workers, weights=weights, jitter=False,
                                   hint=[Placement(l["assignmentId"], l["day"], l["slot"], l["roomId"], l["parity"]) for l in destroyed])
                if res.status not in ("OPTIMAL", "FEASIBLE"):
                    continue
                candidate = rest + as_lessons(res.placements)
                if missing_total(candidate) < missing_total(lessons):
                    lessons = candidate
        score = score_timetable(weekly_ds, lessons, idx, weights)

    def repair_rules(until: float, extra: float = 0.0) -> None:
        """Take the days that break an absolute rule one at a time: all the pairs of that group (at wider levels the pairs of
        the teachers and of the groups that share students with it too) are planned again with the rules as constraints."""
        nonlocal lessons, score
        if not absolute:
            return
        fails: dict[tuple, int] = {}
        for _ in range(2000):
            bad = violation_group_days(weekly_ds, idx, lessons, absolute)
            left = until + extra - time.monotonic()
            if not bad or left < 1.5:
                return
            gid, day = min(bad, key=lambda v: (fails.get(v, 0), rng.random()))  # the least tried first
            tries = fails.get((gid, day), 0)
            level = tries % 3  # this group alone, then with the pairs of its teachers, then with the groups they teach too
            batch = [gid]
            movable = [l for l in lessons if not l.get("locked") and l["id"] not in keep_ids and not l.get("date") and l["assignmentId"] in weekly_ids]
            pool = [l for l in movable if any(idx.audience_touches_group(idx.assignment_of(l)["audience"], g) for g in batch)]
            if level >= 1:  # plus the pairs of the teachers of those, and the groups they teach
                teachers = {t for l in pool for t in teacher_ids(idx.assignment_of(l))}
                pool += [l for l in movable if l not in pool and teachers & set(teacher_ids(idx.assignment_of(l)))]
            if level >= 2:
                groups = {g for l in pool for g, _ in idx.cohorts(idx.assignment_of(l)["audience"])}
                pool += [l for l in movable if l not in pool and groups & {g for g, _ in idx.cohorts(idx.assignment_of(l)["audience"])}]
            gone = {l["id"] for l in pool}
            rest = [l for l in lessons if l["id"] not in gone]
            res = solve_weekly(ds, idx, deficits(rest), rest, min((4.0, 8.0, 15.0)[level], left), rng.randrange(1 << 30), workers, weights=weights, jitter=False,
                               hint=[Placement(l["assignmentId"], l["day"], l["slot"], l["roomId"], l["parity"]) for l in pool],
                               hard_gaps=absolute.gaps, hard_thin=absolute.thin)
            ok = False
            if res.status in ("OPTIMAL", "FEASIBLE") and not res.missing:
                candidate = rest + as_lessons(res.placements)
                cand_score = score_timetable(weekly_ds, candidate, idx, weights)
                if accept(cand_score, candidate, score, lessons) and len(violation_group_days(weekly_ds, idx, candidate, absolute)) <= len(bad):
                    lessons, score, ok = candidate, cand_score, True
            if not ok:
                fails[(gid, day)] = tries + 1

    keep_ids = {l["id"] for l in keep}
    absolute = Rules(rules)  # no gaps / the minimum pairs per day (also no empty study day): strong penalties, but a pair is never left out for them
    base = base + adopted
    # ---- starting point: a quick heuristic timetable, so there is always a complete answer to improve
    todo = deficits(locked + adopted)
    start = as_lessons(construct(ds, idx, todo, base, rng))
    lessons = base + start
    score = score_timetable(weekly_ds, lessons, idx, weights)
    tick(0.02, score)

    # ---- Algorithm 1: one CP-SAT model for the whole weekly timetable, started from that solution
    first = solve_weekly(ds, idx, todo, base, max(2.0, seconds * initial_share), seed, workers,
                         hint=[Placement(l["assignmentId"], l["day"], l["slot"], l["roomId"], l["parity"]) for l in start], weights=weights)
    if first.status in ("OPTIMAL", "FEASIBLE"):
        candidate = base + as_lessons(first.placements)
        cand_score = score_timetable(weekly_ds, candidate, idx, weights)
        if accept(cand_score, candidate, score, lessons):  # never worse than the heuristic
            lessons, score = candidate, cand_score
    tick(initial_share, score)

    complete(started + seconds * 0.5)

    # ---- Algorithm 2: Large Neighborhood Search with CP-SAT as the repair step
    k = 6
    stale = 0
    steps = improved = 0
    lns_deadline = started + seconds * 0.5 if absolute else deadline  # the rest of the time goes to repair_rules below
    while time.monotonic() < lns_deadline - 0.5:
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
        steps += 1
        budget = min(repair_seconds, lns_deadline - time.monotonic())
        res = solve_weekly(ds, idx, need, rest, budget, rng.randrange(1 << 30), workers,
                           hint=[Placement(l["assignmentId"], l["day"], l["slot"], l["roomId"], l["parity"]) for l in destroyed], jitter=False, weights=weights)
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

    # ---- completeness first, then the rules: the days with a gap or too few pairs are planned again with the rules as
    # constraints (a result that loses a pair is never accepted), around everything else
    complete(lns_deadline, extra=20.0)
    repair_rules(deadline, extra=max(90.0, seconds * 2))
    complete(deadline, extra=30.0)
    score = score_timetable(weekly_ds, lessons, idx, weights)

    # ---- reduced attendance: dated session pairs around everything else
    if reduced:
        lessons = lessons + place_sessions(ds, idx, reduced, lessons, rng, new_id, example)
    final = score_timetable({**ds, "assignments": scoped}, lessons, idx)
    tick(1.0, final)
    return Generated(lessons, final, seed, time.monotonic() - started, steps, improved, sum(n.halves for n in deficits(lessons).values()) / 2)
