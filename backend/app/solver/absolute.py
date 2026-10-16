"""The absolute comfort rules of a generation run: "no gaps between a group's pairs" and "no day below the minimum
number of pairs" (the generate page's switches, when they are off).

The CP-SAT model weighs them far above everything else, but a search that stops after a time limit can still end
with a day that breaks one. `enforce` is the guarantee: it takes the pairs out of every such day (a pair that cannot be
placed without a gap or a one-pair day is reported as missing, as with any other pair that does not fit), until no day
breaks a rule. Locked pairs and other groups' booked pairs are never touched.
"""
from collections import defaultdict

from ..domain.indexes import DatasetIndex
from ..domain.score import _student_views, gaps_in_day
from ..domain.slots import in_week

View = tuple[str, int | None]


class Rules:
    """Which absolute rules a run has, read from the generation rules (an absent or True rule is not absolute, except the
    minimum pairs per day, which is absolute unless the administrator allows thin days)."""

    def __init__(self, rules: dict | None):
        self.gaps = (rules or {}).get("allowGroupGaps") is False
        self.thin = (rules or {}).get("allowThinDays") is not True

    def __bool__(self) -> bool:
        return self.gaps or self.thin


class _Views:
    """Which student views (group, or subgroup) a lesson belongs to, and how many pairs a view needs per week."""

    def __init__(self, ds: dict, idx: DatasetIndex):
        self.idx = idx
        self.ds = ds
        self.by_group: dict[str, list[View]] = defaultdict(list)
        for view in _student_views(ds):
            self.by_group[view[0]].append(view)
        self.required: dict[View, float] = defaultdict(float)
        for a in ds["assignments"]:
            if not idx.is_reduced(a):
                for view in self.of_audience(a):
                    self.required[view] += idx.required_pairs(a)

    def of_audience(self, a: dict) -> list[View]:
        out: list[View] = []
        for g, sub in self.idx.cohorts(a["audience"]):
            for view in self.by_group.get(g, []):
                if sub is None or view[1] is None or view[1] == sub:
                    out.append(view)
        return out

    def of_lesson(self, l: dict) -> list[View]:
        a = self.idx.assignment_of(l)
        return self.of_audience(a) if a else []


def find_violations(ds: dict, idx: DatasetIndex, lessons: list[dict], rules: Rules, views: _Views | None = None) -> list[tuple]:
    """(view, day, week, kind, [lessons of that view, day and week]) for every group day that breaks a rule that is on;
    kind is "gap", "thin" or "empty" (a study day with no pair at all). A view that needs fewer pairs a week than the minimum cannot reach it: it has no thin days."""
    s = ds["settings"]
    views = views or _Views(ds, idx)
    weeks = ["odd", "even"] if s["weekParity"] else ["weekly"]
    minimum = s["minPairsPerDayGroup"]
    per_view: dict[View, list[dict]] = defaultdict(list)
    for l in lessons:
        if not l.get("date"):
            for view in views.of_lesson(l):
                per_view[view].append(l)
    out = []
    for view, vl in per_view.items():
        for d in idx.group_days(view[0]):
            for w in weeks:
                dl = [l for l in vl if l["day"] == d and in_week(l, w)]
                if not dl:
                    if rules.thin and views.required.get(view, 0) >= minimum * len(idx.group_days(view[0])):
                        out.append((view, d, w, "empty", dl))  # a day without pairs, when the view has enough for every day
                    continue
                slots = sorted({l["slot"] for l in dl})
                if rules.gaps and gaps_in_day(slots) > 0:
                    out.append((view, d, w, "gap", dl))
                elif rules.thin and len(slots) < minimum and views.required.get(view, 0) >= minimum:
                    out.append((view, d, w, "thin", dl))
    return out


def violation_group_days(ds: dict, idx: DatasetIndex, lessons: list[dict], rules: Rules) -> list[tuple[str, int]]:
    """(group id, day) of every group day that breaks a rule that is on."""
    return sorted({(v[0][0], v[1]) for v in find_violations(ds, idx, lessons, rules)})


def _runs(slots: list[int]) -> list[list[int]]:
    runs: list[list[int]] = []
    for s in slots:
        if runs and s == runs[-1][-1] + 1:
            runs[-1].append(s)
        else:
            runs.append([s])
    return runs


def enforce(ds: dict, idx: DatasetIndex, lessons: list[dict], rules: Rules, protected: set[str]) -> list[dict]:
    """The lessons without the pairs that break a rule that is on: a day below the minimum loses its pairs; a day with a
    gap keeps its longest run of pairs. Repeated until nothing breaks a rule (a pair shared by several groups leaves all
    of them). `protected` ids (locked pairs, other groups' booked pairs) stay, so a rule can still be broken by those."""
    if not rules:
        return lessons
    views = _Views(ds, idx)
    for _ in range(100):
        dropped: set[str] = set()
        for view, d, w, kind, dl in find_violations(ds, idx, lessons, rules, views):
            if any(l["id"] in dropped for l in dl):
                continue  # an earlier fix in this round already changed this day
            if kind == "empty":
                continue  # nothing to take out: the search puts pairs on that day
            if kind == "thin":
                out = dl
            else:
                keep = max(_runs(sorted({l["slot"] for l in dl})), key=len)  # the longest run, the earliest of equals
                out = [l for l in dl if l["slot"] not in keep]
            dropped |= {l["id"] for l in out if l["id"] not in protected}
        if not dropped:
            break
        lessons = [l for l in lessons if l["id"] not in dropped]
    return lessons
