"""The exam generator in app/solver/exams.py is a port of the frontend's generateExams / generateMidterms and uses the
same seeded random generator, so with the same seed it must place every exam, consultation and atestare exactly the
same way. exam_parity.json holds runs recorded from the TypeScript code (tests/fixtures/make_parity.ts)."""
import json
from pathlib import Path

import pytest

from app.domain.indexes import DatasetIndex
from app.solver.exams import generate_exams, generate_midterms
from app.solver.rng import Rng

FIX = Path(__file__).parent / "fixtures"
DS = json.loads((FIX / "parity.json").read_text())["dataset"]
EXAM = json.loads((FIX / "exam_parity.json").read_text())
RUNS = EXAM["runs"]


def strip(events):
    return [{k: v for k, v in e.items() if k != "id"} for e in events]


@pytest.mark.no_db
def test_random_generator_matches_the_frontend():
    # mulberry32 with seed 5, recorded from frontend/src/domain/rng.ts (Node)
    r = Rng(5)
    assert [round(r.next(), 9) for _ in range(3)] == pytest.approx([0.689775, 0.772743, 0.219763], abs=1e-6)
    assert Rng(7).shuffle(list(range(8))) == [4, 6, 1, 2, 3, 5, 7, 0]


@pytest.mark.no_db
@pytest.mark.parametrize("run", RUNS, ids=[f"{r['round']}-seed{r['seed']}-{len(r['groupIds'])}groups" for r in RUNS])
def test_python_exam_generation_matches_typescript(run):
    idx = DatasetIndex(DS)
    rng = Rng(run["seed"])
    busy = [{**e, "id": f"b{i}"} for i, e in enumerate(run["busy"])]
    if run["round"] in ("session", "reexam"):
        res = generate_exams(DS, idx, run["groupIds"], run["round"], busy, rng, EXAM["classes"])
    else:
        n = 1 if run["round"].endswith("1") else 2
        res = generate_midterms(DS, idx, run["groupIds"], n, EXAM["classes"], busy, rng, run["round"].startswith("re"))
    assert strip(res["events"]) == run["events"]
    assert res["warnings"] == run["warnings"]
