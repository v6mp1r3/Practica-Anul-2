"""Timetable generation jobs (docs/API.md, Generation); the solver is in app/solver."""
from fastapi import APIRouter, Body, Depends
from sqlalchemy import Connection

from ..deps import CurrentUser, get_conn, require_admin
from ..services import generation

router = APIRouter(tags=["generation"])


@router.post("/generate", status_code=202)
def start_generation(data: dict = Body(...), user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    return {"jobId": generation.start(conn, user, data)}


@router.get("/generate/{job_id}")
def generation_status(job_id: str, _: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    return generation.status(conn, job_id)
