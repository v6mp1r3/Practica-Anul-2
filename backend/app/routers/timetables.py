"""Timetables (docs/API.md, Timetables). The work is in services/timetables.py."""
from fastapi import APIRouter, Body, Depends, Query, Request, Response
from sqlalchemy import Connection

from ..db import get_engine
from ..deps import CurrentUser, current_user, get_conn, require_admin
from ..memo import Memo
from ..errors import ApiError
from ..importers import MAX_BYTES, read_sheet
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
    # read at most the limit (+1 byte to know it is over), instead of the whole upload into memory
    if int(request.headers.get("content-length") or 0) > MAX_BYTES:
        raise ApiError(413, "The file is larger than 15 MB")
    data = bytearray()
    async for chunk in request.stream():
        data += chunk
        if len(data) > MAX_BYTES:
            raise ApiError(413, "The file is larger than 15 MB")
    return read_sheet(filename, bytes(data))


def _read_published():
    with get_engine().connect() as conn:
        return svc.get_published(conn)


_published = Memo(_read_published)


@router.get("/published")
def get_published():
    """Public: the timetable students and teachers see, or null before the first publish (from memory, memo.py)."""
    return _published.get()


@router.get("/{timetable_id}")
def get_timetable(timetable_id: str, user: CurrentUser = Depends(current_user), conn: Connection = Depends(get_conn)):
    t = svc.load_timetable(conn, pid(timetable_id))
    # drafts and variants are the administration's work in progress
    if user.role != "admin" and t["status"] != "published":
        raise ApiError(404, "Not found")
    return t


@router.put("/{timetable_id}")
def put_timetable(timetable_id: str, data: dict = Body(...), user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    return svc.save_timetable(conn, timetable_id, data, user)


@router.delete("/{timetable_id}", status_code=204)
def delete_timetable(timetable_id: str, user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    svc.delete_timetable(conn, timetable_id, user)
    return Response(status_code=204)


@router.post("/{timetable_id}/publish")
def publish(timetable_id: str, user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    return svc.publish(conn, timetable_id, user)


@router.post("/{timetable_id}/unpublish")
def unpublish(timetable_id: str, user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    return svc.unpublish(conn, timetable_id, user)
