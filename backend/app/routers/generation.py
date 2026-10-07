"""Timetable generation. The CP-SAT + LNS solver (report, section 2.3) is not built yet, so the job
endpoints answer 501. The contract (docs/API.md, Generation) stays as it is for when it exists."""
from fastapi import APIRouter, Body, Depends

from ..deps import CurrentUser, require_admin
from ..errors import ApiError

router = APIRouter(tags=["generation"])


@router.post("/generate", status_code=202)
def start_generation(_: dict = Body(...), __: CurrentUser = Depends(require_admin)):
    raise ApiError(501, "Timetable generation is not available yet: the solver is not built")


@router.get("/generate/{job_id}")
def generation_status(job_id: str, _: CurrentUser = Depends(require_admin)):
    raise ApiError(404, "Unknown job")
