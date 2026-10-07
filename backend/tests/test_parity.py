"""The server scores and validates timetables with a Python port of the frontend's TypeScript
(frontend/src/domain/score.ts, validator.ts). The fixture holds the demo dataset and timetables scored by the
TypeScript code; the port must give exactly the same numbers. To refresh it after changing the TypeScript, see
tests/fixtures/make_parity.ts."""
import json
from collections import Counter
from pathlib import Path

import pytest

from app.domain.score import score_timetable
from app.domain.validator import find_hard_conflicts

DATA = json.loads((Path(__file__).parent / "fixtures" / "parity.json").read_text())


@pytest.mark.no_db
@pytest.mark.parametrize("case", DATA["cases"], ids=[c["name"] for c in DATA["cases"]])
def test_python_port_matches_typescript(case):
    ds = DATA["dataset"]
    ts = case["score"]
    py = score_timetable(ds, case["lessons"])
    assert py["hard"] == ts["hard"]
    assert py["soft"] == pytest.approx(ts["soft"], abs=1e-9)
    for key, value in ts["breakdown"].items():
        assert py["breakdown"][key] == pytest.approx(value, abs=1e-9), key
    assert dict(Counter(c["kind"] for c in find_hard_conflicts(ds, case["lessons"]))) == case["kinds"]
