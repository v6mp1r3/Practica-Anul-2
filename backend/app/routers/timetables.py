"""Timetables (docs/API.md, Timetables). The work is in services/timetables.py."""
from fastapi import APIRouter, Body, Depends, Query, Request, Response
from sqlalchemy import Connection

from ..db import get_engine
from ..deps import CurrentUser, current_user, get_conn, require_admin
from ..memo import Memo
from ..importers import read_sheet
from ..services import timetables as svc
from ..util import pid

router = APIRouter(prefix="/timetables", tags=["timetables"])


def _read_list():
    with get_engine().connect() as conn:
        return svc.list_timetables(conn)


_list = Memo(_read_list)


@router.get("")
def list_timetables(_: CurrentUser = Depends(require_admin)):
    """The same for every administrator (the client keeps its faculty's), so from memory too (memo.py)."""
    return _list.get()


@router.post("/import-sheet")
async def import_sheet(request: Request, filename: str = Query(""), _: CurrentUser = Depends(require_admin)):
    """A faculty's timetable as published (PDF or Excel), read into rows: groups, day, time, week, type,
    subject, teacher and room. Nothing is saved; the client matches the rows and saves a draft."""
    return read_sheet(filename, await request.body())


def _read_published():
    with get_engine().connect() as conn:
        return svc.get_published(conn)


_published = Memo(_read_published)


@router.get("/published")
def get_published():
    """Public: the timetable students and teachers see, or null before the first publish (from memory, memo.py)."""
    return _published.get()


@router.get("/{timetable_id}")
def get_timetable(timetable_id: str, _: CurrentUser = Depends(current_user), conn: Connection = Depends(get_conn)):
    return svc.load_timetable(conn, pid(timetable_id))


@router.put("/{timetable_id}")
def put_timetable(timetable_id: str, data: dict = Body(...), user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    return svc.save_timetable(conn, timetable_id, data, user)


@router.delete("/{timetable_id}", status_code=204)
def delete_timetable(timetable_id: str, _: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    svc.delete_timetable(conn, timetable_id)
    return Response(status_code=204)


@router.post("/{timetable_id}/publish")
def publish(timetable_id: str, _: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    return svc.publish(conn, timetable_id)


@router.post("/{timetable_id}/unpublish")
def unpublish(timetable_id: str, user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    return svc.unpublish(conn, timetable_id, user)
