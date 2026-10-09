"""Everything the solver (and the validator) needs in one object, like GET /dataset."""
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import Connection

from . import repo
from .db import get_engine
from .settings_io import read_settings

PARTS = {
    "settings": read_settings,
    "teachers": repo.load_teachers,
    "rooms": repo.load_rooms,
    "groups": repo.load_groups,
    "streams": repo.load_streams,
    "subjects": repo.load_subjects,
    "clusters": repo.load_clusters,
    "assignments": repo.load_assignments,
}


def build_dataset(conn: Connection) -> dict:
    return {name: load(conn) for name, load in PARTS.items()}


def _load_alone(load):
    with get_engine().connect() as conn:
        return load(conn)


def read_dataset() -> dict:
    """The committed dataset, its parts read side by side on their own connections (each part is
    several round trips to the database, so one after the other they add up to seconds)."""
    with ThreadPoolExecutor(len(PARTS)) as pool:
        futures = {name: pool.submit(_load_alone, load) for name, load in PARTS.items()}
        return {name: f.result() for name, f in futures.items()}
