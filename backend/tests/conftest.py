"""Tests run against a real PostgreSQL. Point TEST_DATABASE_URL at an EMPTY, throwaway database, for example:

    createdb eduschedule_test
    TEST_DATABASE_URL=postgresql://localhost/eduschedule_test .venv/bin/pytest

Every test starts from a freshly built database (backend/db/schema.sql + seed.sql), so the public schema
of that database is dropped and rebuilt each time. Never point it at a database you care about."""
import os
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient

DB_DIR = Path(__file__).resolve().parents[1] / "db"
TEST_URL = os.environ.get("TEST_DATABASE_URL")

if TEST_URL:
    os.environ["DATABASE_URL"] = TEST_URL
    os.environ["JWT_SECRET"] = "test-secret-with-at-least-32-characters-ok"
    # the solver gets one second per variant and four cores in tests
    os.environ["GENERATION_SECONDS_PER_ITERATION"] = "0.001"
    os.environ["GENERATION_MIN_SECONDS"] = "1"
    os.environ["SOLVER_WORKERS"] = "4"


def _plain(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://")


def pytest_collection_modifyitems(config, items):
    if not TEST_URL:
        skip = pytest.mark.skip(reason="set TEST_DATABASE_URL to run the API tests")
        for item in items:
            if "no_db" not in item.keywords:
                item.add_marker(skip)


@pytest.fixture
def db():
    """A rebuilt database; yields a psycopg connection for direct checks."""
    from app.db import reset_engine

    from app import throttle

    throttle.reset_all()
    reset_engine()
    with psycopg.connect(_plain(TEST_URL), autocommit=True) as conn:
        conn.execute("drop schema public cascade; create schema public;")
        for name in ("schema.sql", "seed.sql"):
            conn.execute((DB_DIR / name).read_text())
        yield conn
    reset_engine()


@pytest.fixture
def client(db):
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c


def make_admin(db, username="elena", faculty="FCIM", password="secret-pass-1", name="Elena Popescu"):
    from app.security import hash_password

    db.execute(
        "insert into app_user (username, password_hash, name, role, faculty_id) select %s, %s, %s, 'admin', id from faculty where code = %s",
        (username, hash_password(password), name, faculty),
    )


@pytest.fixture
def admin(client, db):
    """Headers of a signed-in FCIM administrator."""
    make_admin(db)
    token = client.post("/api/auth/login", json={"username": "elena", "password": "secret-pass-1"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_admin(client, db):
    """A signed-in administrator of another faculty (FET)."""
    make_admin(db, username="ion", faculty="FET", name="Ion Sirbu")
    token = client.post("/api/auth/login", json={"username": "ion", "password": "secret-pass-1"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}
