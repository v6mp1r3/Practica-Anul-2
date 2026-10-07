"""Notifications (docs/API.md, Notifications)."""
from fastapi import APIRouter, Body, Depends, Response
from sqlalchemy import Connection

from ..deps import CurrentUser, current_user, get_conn
from ..services import notify

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user: CurrentUser = Depends(current_user), conn: Connection = Depends(get_conn)):
    return notify.list_for(conn, user.id, user.role)


@router.post("/read", status_code=204)
def mark_read(data: dict = Body(...), user: CurrentUser = Depends(current_user), conn: Connection = Depends(get_conn)):
    notify.mark_read(conn, user.id, data.get("ids") or [])
    conn.commit()
    return Response(status_code=204)
