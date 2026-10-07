"""Login, the signed-in user's profile and password (docs/API.md, Auth)."""
from fastapi import APIRouter, Body, Depends, Response
from pydantic import BaseModel
from sqlalchemy import Connection, text

from .. import repo
from ..deps import CurrentUser, current_user, get_conn
from ..errors import ApiError
from ..security import check_new_password, create_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class Login(BaseModel):
    username: str
    password: str


def user_json(conn: Connection, user_id: int) -> dict:
    r = conn.execute(
        text(
            "select u.id, u.username, u.name, u.role::text as role, f.name as faculty, u.email, u.phone, u.avatar_url, u.email_notifications "
            "from app_user u left join faculty f on f.id = u.faculty_id where u.id = :id"
        ),
        {"id": user_id},
    ).mappings().first()
    if not r:
        raise ApiError(401, "Not signed in")
    u = {"id": str(r["id"]), "username": r["username"], "name": r["name"], "role": r["role"], "emailNotifications": r["email_notifications"]}
    for key, col in (("faculty", "faculty"), ("email", "email"), ("phone", "phone"), ("avatar", "avatar_url")):
        if r[col]:
            u[key] = r[col]
    return u


@router.post("/login")
def login(body: Login, conn: Connection = Depends(get_conn)):
    row = conn.execute(text("select id, password_hash from app_user where lower(username) = :u"), {"u": body.username.strip().lower()}).first()
    if not row or not verify_password(body.password, row[1]):
        raise ApiError(401, "Invalid credentials")
    return {"token": create_token(row[0]), "user": user_json(conn, row[0])}


@router.get("/me")
def me(user: CurrentUser = Depends(current_user), conn: Connection = Depends(get_conn)):
    return user_json(conn, user.id)


@router.post("/logout", status_code=204)
def logout(_: CurrentUser = Depends(current_user)):
    # tokens are stateless: the client forgets its token
    return Response(status_code=204)


@router.put("/me")
def update_profile(data: dict = Body(...), user: CurrentUser = Depends(current_user), conn: Connection = Depends(get_conn)):
    name = (data.get("name") or "").strip()
    if not name:
        raise ApiError(422, "Name is required")
    sets = {"name": name, "email": (data.get("email") or "").strip() or None, "phone": (data.get("phone") or "").strip() or None, "notif": bool(data.get("emailNotifications"))}
    sql = "update app_user set name = :name, email = :email, phone = :phone, email_notifications = :notif"
    if "avatar" in data:
        sets["avatar"] = data["avatar"] or None
        sql += ", avatar_url = :avatar"
    if data.get("faculty") is not None and user.role == "admin":
        sets["fid"] = repo.faculty_id_by_name(conn, data["faculty"])
        sql += ", faculty_id = :fid"
    conn.execute(text(sql + " where id = :id"), {**sets, "id": user.id})
    conn.commit()
    return user_json(conn, user.id)


@router.post("/password", status_code=204)
def change_password(data: dict = Body(...), user: CurrentUser = Depends(current_user), conn: Connection = Depends(get_conn)):
    stored = conn.execute(text("select password_hash from app_user where id = :id"), {"id": user.id}).scalar()
    if not verify_password(data.get("current") or "", stored):
        raise ApiError(400, "Wrong password")
    new = data.get("next") or ""
    check_new_password(new)
    conn.execute(text("update app_user set password_hash = :h where id = :id"), {"h": hash_password(new), "id": user.id})
    conn.commit()
    return Response(status_code=204)
