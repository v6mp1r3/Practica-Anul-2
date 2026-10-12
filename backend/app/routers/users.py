"""Teacher accounts (docs/API.md, Users): an administrator gives a teacher a login so the teacher can
set their own availability. Only 'teacher' accounts are created, changed and deleted here."""
from fastapi import APIRouter, Body, Depends, Response
from sqlalchemy import Connection, text
from sqlalchemy.exc import IntegrityError

from ..deps import CurrentUser, get_conn, require_admin
from ..errors import ApiError
from ..security import check_new_password, hash_password
from ..util import pid
from .auth import user_json
from .data import _own_faculty_record

router = APIRouter(prefix="/users", tags=["users"])


def _teacher_account(conn: Connection, user: CurrentUser, user_id: int) -> int:
    """The teacher behind a teacher account the administrator may manage (404 / 403 otherwise)."""
    row = conn.execute(text("select role::text, teacher_id from app_user where id = :id"), {"id": user_id}).first()
    if not row:
        raise ApiError(404, "Not found")
    if row[0] != "teacher":
        raise ApiError(403, "Only teacher accounts are managed here")
    _own_faculty_record(conn, user, "teacher", row[1], None)
    return row[1]


def _username(data: dict) -> str:
    username = (data.get("username") or "").strip().lower()
    if not username:
        raise ApiError(422, "Username is required")
    return username


@router.get("")
def list_users(user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    """The teacher accounts (any faculty: a teacher may teach in several) and the administrator themself."""
    ids = conn.execute(text("select id from app_user where role = 'teacher' or id = :me order by id"), {"me": user.id}).scalars().all()
    return [user_json(conn, i) for i in ids]


@router.post("", status_code=201)
def create_user(data: dict = Body(...), user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    if data.get("role") != "teacher" or not data.get("teacherId"):
        raise ApiError(422, "Only teacher accounts can be created (with teacherId)")
    tid = pid(data["teacherId"])
    _own_faculty_record(conn, user, "teacher", tid, None)
    password = data.get("password") or ""
    check_new_password(password)
    name = (data.get("name") or "").strip() or conn.execute(text("select name from teacher where id = :t"), {"t": tid}).scalar_one()
    try:
        uid = conn.execute(
            text(
                "insert into app_user (username, password_hash, name, role, email, teacher_id) "
                "values (:u, :p, :n, 'teacher', :e, :t) returning id"
            ),
            {"u": _username(data), "p": hash_password(password), "n": name, "e": (data.get("email") or "").strip() or None, "t": tid},
        ).scalar_one()
        conn.commit()
    except IntegrityError:
        conn.rollback()
        raise ApiError(422, "Username taken, or this teacher already has an account")
    return user_json(conn, uid)


@router.put("/{user_id}")
def update_user(user_id: str, data: dict = Body(...), user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    """Rename the login, or set a new password (when the teacher forgot theirs)."""
    uid = pid(user_id)
    _teacher_account(conn, user, uid)
    sets: dict = {}
    if "username" in data:
        sets["username"] = _username(data)
    if data.get("password"):
        check_new_password(data["password"])
        sets["password_hash"] = hash_password(data["password"])
    if sets:
        try:
            conn.execute(text(f"update app_user set {', '.join(f'{k} = :{k}' for k in sets)} where id = :id"), {**sets, "id": uid})
            conn.commit()
        except IntegrityError:
            conn.rollback()
            raise ApiError(422, "Username taken")
    return user_json(conn, uid)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: str, user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    uid = pid(user_id)
    _teacher_account(conn, user, uid)
    conn.execute(text("delete from app_user where id = :id"), {"id": uid})
    conn.commit()
    return Response(status_code=204)
