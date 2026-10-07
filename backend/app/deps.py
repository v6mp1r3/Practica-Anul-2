"""Request dependencies: a database connection and the signed-in user."""
from dataclasses import dataclass
from typing import Iterator

from fastapi import Depends, Header
from sqlalchemy import Connection, text

from .db import get_engine
from .errors import ApiError
from .security import read_token


def get_conn() -> Iterator[Connection]:
    """One connection per request. Writes call `conn.commit()` themselves, so a failed commit is
    still an error response; anything not committed is rolled back when the connection closes."""
    with get_engine().connect() as conn:
        yield conn


@dataclass
class CurrentUser:
    id: int
    username: str
    name: str
    role: str
    faculty_id: int | None
    faculty: str | None


def _load_user(conn: Connection, user_id: int) -> CurrentUser | None:
    row = conn.execute(
        text(
            "select u.id, u.username, u.name, u.role::text as role, u.faculty_id, f.name as faculty "
            "from app_user u left join faculty f on f.id = u.faculty_id where u.id = :id"
        ),
        {"id": user_id},
    ).mappings().first()
    return CurrentUser(**row) if row else None


def current_user(authorization: str | None = Header(default=None), conn: Connection = Depends(get_conn)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "Not signed in")
    user = _load_user(conn, read_token(authorization[7:].strip()))
    if not user:
        raise ApiError(401, "Not signed in")
    return user


def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if user.role != "admin":
        raise ApiError(403, "Forbidden")
    return user
