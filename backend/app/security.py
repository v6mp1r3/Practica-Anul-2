"""Passwords (bcrypt) and login tokens (JWT, HS256)."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_config
from .errors import ApiError


MAX_PASSWORD_BYTES = 72  # bcrypt ignores everything after this


def check_new_password(password: str) -> None:
    if len(password) < 8:
        raise ApiError(422, "Password too short")
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        raise ApiError(422, f"Password too long (at most {MAX_PASSWORD_BYTES} bytes)")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user_id: int) -> str:
    cfg = get_config()
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(hours=cfg.jwt_expire_hours)}
    return jwt.encode(payload, cfg.jwt_secret, algorithm="HS256")


def read_token(token: str) -> int:
    try:
        payload = jwt.decode(token, get_config().jwt_secret, algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise ApiError(401, "Not signed in")
