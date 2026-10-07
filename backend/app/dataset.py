"""Everything the solver (and the validator) needs in one object, like GET /dataset."""
from sqlalchemy import Connection

from . import repo
from .settings_io import read_settings


def build_dataset(conn: Connection) -> dict:
    return {
        "settings": read_settings(conn),
        "teachers": repo.load_teachers(conn),
        "rooms": repo.load_rooms(conn),
        "groups": repo.load_groups(conn),
        "streams": repo.load_streams(conn),
        "subjects": repo.load_subjects(conn),
        "assignments": repo.load_assignments(conn),
    }
