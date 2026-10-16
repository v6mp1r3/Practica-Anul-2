"""Port of frontend/src/domain/weeks.ts: how many pairs a weekly teaching load still needs, week by week.

A load of N pairs per week has N pairs in odd weeks and N in even weeks. A weekly pair counts in both weeks, an
odd- or even-week pair only in its own. So "odd weeks at pair 2, even weeks at pair 3" is one pair per week, and a
load of 0.5 is one pair every other week (odd or even, either will do)."""
import math
from dataclasses import dataclass


@dataclass(frozen=True)
class WeekNeed:
    odd: int = 0  # pairs still needed in odd weeks only
    even: int = 0  # pairs still needed in even weeks only
    either: int = 0  # a half pair (0.5 per week) still needed, in odd or in even weeks

    @property
    def weekly(self) -> int:
        """Pairs that can go every week (both weeks need one)."""
        return min(self.odd, self.even)

    @property
    def halves(self) -> int:
        """Week-pairs missing: a weekly pair is two, an odd/even pair one."""
        return self.odd + self.even + self.either

    def __bool__(self) -> bool:
        return self.halves > 0


def week_counts(lessons: list[dict]) -> tuple[int, int]:
    """Pairs in odd weeks and in even weeks."""
    odd = sum(1 for l in lessons if l.get("parity", "weekly") in ("weekly", "odd"))
    even = sum(1 for l in lessons if l.get("parity", "weekly") in ("weekly", "even"))
    return odd, even


def week_need(pairs_per_week: float, lessons: list[dict]) -> WeekNeed:
    """What a load of `pairs_per_week` still needs, given its weekly (not dated) `lessons`."""
    base = math.floor(pairs_per_week + 1e-9)
    half = 1 if pairs_per_week - base > 1e-9 else 0
    have_odd, have_even = week_counts(lessons)
    # a pair over the base in one week is the half pair, already placed
    over = max(0, have_odd - base) + max(0, have_even - base)
    return WeekNeed(max(0, base - have_odd), max(0, base - have_even), max(0, half - over))


def week_excess(pairs_per_week: float, lessons: list[dict]) -> int:
    """Week-pairs too many (a weekly pair too many is two)."""
    odd, even = week_counts(lessons)
    return max(0, odd + even - round(2 * pairs_per_week))
