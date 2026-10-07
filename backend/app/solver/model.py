"""CP-SAT model of the weekly timetable (report, section 2.3.1, Algorithm 1).

One Boolean x[a, day, slot, room] per teaching load `a` and every combination that can possibly work: the room
must be big enough and of the right type with the right equipment, the day must be allowed for every group, the
teacher must be free, and nothing already fixed (locked pairs, other faculties' published pairs) may clash.
The hard constraints are the report's "at most one" rules plus "exactly the required number of pairs":

  * a teacher, a room and a group (or subgroup) are in one place at a time, per odd and even week;
  * every load gets all its pairs (a penalised slack variable keeps the model feasible when the data is
    contradictory, so the answer shows what is missing instead of failing).

The soft constraints are the weighted penalties of frontend/src/domain/score.ts, written as a linear objective
(gaps are counted with prefix/suffix "something is scheduled before/after" variables). Scaled by SCALE, the
objective of a complete timetable equals its score.soft x SCALE; tests check this.
"""
import os
import random
from collections import defaultdict
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from ..domain.indexes import DatasetIndex
from ..domain.score import SOFT_WEIGHTS
from ..domain.slots import in_week, lessons_overlap, parity_weight, slot_key

SCALE = 840  # 2 weeks x lcm(1..7): keeps every coefficient an integer
MISSING_PENALTY = 500_000  # a pair left out costs far more than anything one pair can save (about 600 soft points)
WEEKS = ("odd", "even")  # two lessons clash only if they share a week


@dataclass
class Placement:
    assignmentId: str
    day: int
    slot: int
    roomId: str
    parity: str

    def as_lesson(self, lid: str) -> dict:
        return {"id": lid, "assignmentId": self.assignmentId, "day": self.day, "slot": self.slot, "roomId": self.roomId, "parity": self.parity}


@dataclass
class SolveResult:
    status: str
    placements: list[Placement] = field(default_factory=list)
    missing: dict[str, int] = field(default_factory=dict)
    objective: int | None = None
    bound: float | None = None
    variables: int = 0


def _weeks_of(parity: str) -> tuple[str, ...]:
    return WEEKS if parity == "weekly" else (parity,)


class _Occupancy:
    """For one student view or one teacher on one day and week: is slot s used? Plus "something before/after"."""

    def __init__(self, model: cp_model.CpModel, n_slots: int, terms: list[list], const: list[bool]):
        self.m = model
        self.n = n_slots
        self.o: list = []
        for s in range(n_slots):
            if const[s]:
                self.o.append(1)
            elif not terms[s]:
                self.o.append(0)
            else:
                v = model.NewBoolVar("")
                for t in terms[s]:
                    model.Add(v >= t)
                model.Add(v <= sum(terms[s]))
                self.o.append(v)
        self.pre: list = []
        for s in range(n_slots):
            self.pre.append(self._either(self.o[s], self.pre[s - 1]) if s else self.o[0])
        self.suf: list = [0] * n_slots
        for s in range(n_slots - 1, -1, -1):
            self.suf[s] = self._either(self.o[s], self.suf[s + 1]) if s < n_slots - 1 else self.o[s]

    def _either(self, a, b):
        if isinstance(a, int) and isinstance(b, int):
            return int(a or b)
        if (isinstance(a, int) and a == 1) or (isinstance(b, int) and b == 1):
            return 1
        if isinstance(a, int):
            return b
        if isinstance(b, int):
            return a
        v = self.m.NewBoolVar("")  # lower bounds only: it appears with a positive weight
        self.m.Add(v >= a)
        self.m.Add(v >= b)
        return v

    def used(self) -> bool:
        return any(not (isinstance(x, int) and x == 0) for x in self.o)

    def gap_terms(self) -> list:
        """One Boolean per empty pair that has something scheduled before and after it."""
        out = []
        for s in range(1, self.n - 1):
            e = self.pre[s - 1] + self.suf[s + 1] - self.o[s] - 1
            if isinstance(e, int):
                if e > 0:
                    out.append(1)  # a certain gap (only possible through fixed pairs): a constant, not worth a variable
                continue
            g = self.m.NewBoolVar("")
            self.m.Add(g >= e)
            out.append(g)
        return out


def solve_weekly(
    ds: dict,
    idx: DatasetIndex,
    need: dict[str, int],
    fixed: list[dict],
    time_limit: float,
    seed: int = 1,
    workers: int | None = None,
    hint: list[Placement] | None = None,
    jitter: bool = True,
    fix: list[Placement] | None = None,
) -> SolveResult:
    """Place `need[assignment id]` pairs of each listed teaching load around the `fixed` lessons."""
    settings = ds["settings"]
    n_slots = len(settings["slots"])
    rng = random.Random(seed)
    model = cp_model.CpModel()
    loads = [idx.assignments[a] for a in need if need[a] > 0 and a in idx.assignments]
    if not loads:
        return SolveResult("OPTIMAL")

    fixed = [f for f in fixed if idx.assignment_of(f)]
    fixed_at: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for f in fixed:
        fixed_at[(f["day"], f["slot"])].append(f)

    def clashes_fixed(a: dict, d: int, s: int, room_id: str) -> bool:
        probe = {"day": d, "slot": s, "parity": a["parity"]}
        for f in fixed_at.get((d, s), ()):
            if not lessons_overlap(probe, f):
                continue
            fa = idx.assignment_of(f)
            if fa["teacherId"] == a["teacherId"] or f["roomId"] == room_id or idx.audiences_overlap(fa["audience"], a["audience"]):
                return True
        return False

    # ---- variables
    X: dict[str, dict[tuple[int, int], list[tuple[str, cp_model.IntVar]]]] = {}
    var_info: dict[int, tuple[dict, int, int, str]] = {}
    n_vars = 0
    for a in loads:
        teacher = idx.teachers.get(a["teacherId"], {})
        size = idx.audience_size(a["audience"])
        rooms = [r for r in ds["rooms"] if r["capacity"] >= size and idx.room_fits(a, r) and idx.has_equipment(a, r)]
        X[a["id"]] = {}
        for d in idx.allowed_days(a):
            for s in range(n_slots):
                if slot_key(d, s) in teacher.get("unavailable", []):
                    continue
                options = []
                for r in rooms:
                    if clashes_fixed(a, d, s, r["id"]):
                        continue
                    v = model.NewBoolVar("")
                    options.append((r["id"], v))
                    var_info[v.Index()] = (a, d, s, r["id"])
                    n_vars += 1
                if options:
                    X[a["id"]][(d, s)] = options

    # ---- exactly the required pairs (a slack keeps the model feasible)
    missing: dict[str, cp_model.IntVar] = {}
    for a in loads:
        allv = [v for opts in X[a["id"]].values() for _, v in opts]
        missing[a["id"]] = model.NewIntVar(0, need[a["id"]], "")
        model.Add(sum(allv) + missing[a["id"]] == need[a["id"]])

    # ---- nobody and nothing in two places at once, week by week
    groups: dict[tuple, list] = defaultdict(list)  # (kind, key, day, slot, week) -> vars
    group_points: dict[str, set[int]] = defaultdict(lambda: {0})
    for a in loads:
        for g, sub in idx.cohorts(a["audience"]):
            if sub is not None:
                group_points[g].add(sub)
    for a in loads:
        points: list[tuple[str, int]] = []
        for g, sub in idx.cohorts(a["audience"]):
            points += [(g, p) for p in group_points[g]] if sub is None else [(g, sub)]
        for (d, s), opts in X[a["id"]].items():
            for w in _weeks_of(a["parity"]):
                for room_id, v in opts:
                    groups[("teacher", a["teacherId"], d, s, w)].append(v)
                    groups[("room", room_id, d, s, w)].append(v)
                    for pt in points:
                        groups[("group", pt, d, s, w)].append(v)
    seen = set()
    for vs in groups.values():
        if len(vs) < 2:
            continue
        key = tuple(sorted(v.Index() for v in vs))
        if key in seen:
            continue
        seen.add(key)
        model.AddAtMostOne(vs)

    # ---- soft constraints (the weighted penalties of score.ts)
    obj: dict[int, int] = defaultdict(int)  # variable index -> coefficient
    obj_vars: dict[int, cp_model.IntVar] = {}

    def add_obj(var, coef: int) -> None:
        if coef:
            obj[var.Index()] += coef
            obj_vars[var.Index()] = var

    weekly_mode = bool(settings["weekParity"])
    score_weeks = list(WEEKS) if weekly_mode else ["weekly"]
    share = 1 / len(score_weeks)
    days_all = list(range(settings["workingDays"]))
    no_shifts = not settings.get("yearShifts")

    for a in loads:
        teacher = idx.teachers.get(a["teacherId"], {})
        pref = teacher.get("preferred") or []
        pref_rooms = {r["id"] for r in idx.preferred_rooms(a)}
        edge = bool(idx.subjects.get(a["subjectId"], {}).get("edgeOfDay"))
        pw = parity_weight(a["parity"])
        for (d, s), opts in X[a["id"]].items():
            for room_id, v in opts:
                c = 0.0
                if pref and slot_key(d, s) not in pref:
                    c += 0.5 * SOFT_WEIGHTS["preferenceMisses"]
                if pref_rooms and room_id not in pref_rooms:
                    c += SOFT_WEIGHTS["roomMisses"] * pw
                c += SOFT_WEIGHTS["shiftMisses"] * idx.shift_distance(a, s) * pw
                if no_shifts and s == 0:
                    c += SOFT_WEIGHTS["earlyStarts"] * pw
                add_obj(v, round(c * SCALE) + (rng.randint(0, 12) if jitter else 0))

    # occupancy per (entity, day, week): terms are the vars (grouped per assignment and slot) plus fixed pairs
    def collect(entity_hits, const_hits, days):
        """entity_hits: list of assignments; const_hits: fixed lessons. -> {(day, week): _Occupancy}"""
        terms = {(d, w): [[] for _ in range(n_slots)] for d in days for w in score_weeks}
        const = {(d, w): [False] * n_slots for d in days for w in score_weeks}
        for a in entity_hits:
            for (d, s), opts in X[a["id"]].items():
                if d not in days:
                    continue
                expr = sum(v for _, v in opts)
                for w in score_weeks:
                    if w == "weekly" or a["parity"] in ("weekly", w):
                        terms[(d, w)][s].append(expr)
        for f in const_hits:
            if f.get("date") or f["day"] not in days or f["slot"] >= n_slots:
                continue
            for w in score_weeks:
                if in_week(f, w):
                    const[(f["day"], w)][f["slot"]] = True
        return {k: _Occupancy(model, n_slots, terms[k], const[k]) for k in terms}

    # teachers
    by_teacher: dict[str, list[dict]] = defaultdict(list)
    for a in loads:
        by_teacher[a["teacherId"]].append(a)
    for tid, tl in by_teacher.items():
        const_hits = [f for f in fixed if idx.assignment_of(f)["teacherId"] == tid]
        for (d, w), occ in collect(tl, const_hits, days_all).items():
            if not occ.used():
                continue
            for g in occ.gap_terms():
                if not isinstance(g, int):
                    add_obj(g, round(SOFT_WEIGHTS["teacherGaps"] * share * SCALE))

    # students: every (group, subgroup) view, as score.ts does
    for grp in ds["groups"]:
        gid = grp["id"]
        views = [(gid, s + 1) for s in range(grp["subgroups"])] if grp["subgroups"] > 1 else [(gid, None)]
        gdays = idx.group_days(gid)
        if not gdays:
            continue
        max_pairs = idx.group_max_pairs(gid)

        def hits(cohort_list, view):
            return any(g == view[0] and (cs is None or view[1] is None or cs == view[1]) for g, cs in cohort_list)

        for view in views:
            vl = [a for a in loads if hits(idx.cohorts(a["audience"]), view)]
            if not vl:
                continue
            cf = [f for f in fixed if hits(idx.cohorts(idx.assignment_of(f)["audience"]), view)]
            occs = collect(vl, cf, gdays)
            per_week_loads: dict[str, list] = defaultdict(list)
            for (d, w), occ in occs.items():
                if not occ.used():
                    per_week_loads[w].append(0)
                    continue
                for g in occ.gap_terms():
                    if not isinstance(g, int):
                        add_obj(g, round(SOFT_WEIGHTS["groupGaps"] * share * SCALE))
                load = sum(occ.o)
                per_week_loads[w].append(load)
                if len(occ.o) > max_pairs:
                    ex = model.NewIntVar(0, n_slots, "")
                    model.Add(ex >= load - max_pairs)
                    add_obj(ex, round(SOFT_WEIGHTS["dayOverload"] * share * SCALE))
                # first-or-last-pair-only subjects (e.g. sport) must not sit between other pairs
                for a in vl:
                    if not idx.subjects.get(a["subjectId"], {}).get("edgeOfDay"):
                        continue
                    for (dd, s), opts in X[a["id"]].items():
                        if dd != d or s == 0 or s == n_slots - 1 or not (w == "weekly" or a["parity"] in ("weekly", w)):
                            continue
                        e = sum(v for _, v in opts) + occ.pre[s - 1] + occ.suf[s + 1] - 2
                        m = model.NewBoolVar("")
                        model.Add(m >= e)
                        add_obj(m, round(SOFT_WEIGHTS["edgeMisses"] * share * SCALE))
            # a balanced week: deviation of each day's load from the week's average load
            n_days = len(gdays)
            for w, loads_w in per_week_loads.items():
                if len(loads_w) < 2 or all(isinstance(x, int) for x in loads_w):
                    continue
                total = sum(loads_w)
                for ld in loads_w:
                    dev = model.NewIntVar(0, n_days * n_slots, "")
                    model.Add(dev >= n_days * ld - total)
                    model.Add(dev >= total - n_days * ld)
                    add_obj(dev, round(SOFT_WEIGHTS["unevenDays"] * share * SCALE / n_days))

    for a in loads:
        add_obj(missing[a["id"]], MISSING_PENALTY)
    model.Minimize(sum(c * obj_vars[i] for i, c in obj.items()))

    if fix is not None:
        # pin the pairs to this timetable: only the helper variables remain, so the objective is its penalty
        wanted = {(p.assignmentId, p.day, p.slot, p.roomId) for p in fix}
        found = set()
        for a in loads:
            for (d, s), opts in X[a["id"]].items():
                for room_id, v in opts:
                    key = (a["id"], d, s, room_id)
                    model.Add(v == (1 if key in wanted else 0))
                    found.add(key)
        if wanted - found:
            raise ValueError(f"cannot pin pairs that are not allowed placements: {sorted(wanted - found)[:3]}")
    if hint:
        by_key = {(p.assignmentId, p.day, p.slot, p.roomId): None for p in hint}
        for a in loads:
            for (d, s), opts in X[a["id"]].items():
                for room_id, v in opts:
                    model.AddHint(v, 1 if (a["id"], d, s, room_id) in by_key else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.5, time_limit)
    solver.parameters.random_seed = seed % 2147483647
    solver.parameters.num_workers = workers or min(8, os.cpu_count() or 4)
    status = solver.Solve(model)
    name = solver.StatusName(status)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult(name, variables=n_vars)
    placements = []
    for a in loads:
        for (d, s), opts in X[a["id"]].items():
            for room_id, v in opts:
                if solver.Value(v):
                    placements.append(Placement(a["id"], d, s, room_id, a["parity"]))
    miss = {aid: solver.Value(v) for aid, v in missing.items() if solver.Value(v)}
    return SolveResult(name, placements, miss, int(round(solver.ObjectiveValue())), solver.BestObjectiveBound(), n_vars)
