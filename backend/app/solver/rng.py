"""The frontend's seeded random generator (mulberry32, frontend/src/domain/rng.ts), bit for bit, so that the same
seed gives the same shuffles as the TypeScript code and the exam generator can be compared with it."""
M = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & M


class Rng:
    def __init__(self, seed: int):
        self.s = seed & M

    def next(self) -> float:
        self.s = (self.s + 0x6D2B79F5) & M
        t = self.s
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & M
        return ((t ^ (t >> 14)) & M) / 4294967296

    def int(self, n: int) -> int:
        return int(self.next() * n)

    def pick(self, items: list):
        return items[int(self.next() * len(items))]

    def shuffle(self, items) -> list:
        a = list(items)
        for i in range(len(a) - 1, 0, -1):
            j = int(self.next() * (i + 1))
            a[i], a[j] = a[j], a[i]
        return a
