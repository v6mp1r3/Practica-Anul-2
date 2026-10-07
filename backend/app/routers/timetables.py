"""Timetables (docs/API.md, Timetables). The work is in services/timetables.py."""
from fastapi import APIRouter, Body, Depends, Response
from sqlalchemy import Connection

from ..deps import CurrentUser, current_user, get_conn, require_admin
from ..services import timetables as svc
from ..util import pid

router = APIRouter(prefix="/timetables", tags=["timetables"])


@router.get("")
def list_timetables(_: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    return svc.list_timetables(conn)


@router.get("/published")
def get_published(conn: Connection = Depends(get_conn)):
    """Public: the timetable students and teachers see, or null before the first publish."""
    return svc.get_published(conn)


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
