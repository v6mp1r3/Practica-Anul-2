"""Which groups an administrator may schedule: their own faculty's. Every write that touches groups
(timetables, streams, clusters, schedule changes, exam plans) checks against this."""
from sqlalchemy import Connection, text

from .deps import CurrentUser
from .errors import ApiError
from .util import pid

NOT_YOURS = "Only your own faculty's groups can be changed"


def my_group_ids(conn: Connection, user: CurrentUser) -> set[int]:
    return set(conn.execute(text("select id from student_group where faculty_id = :f"), {"f": user.faculty_id}).scalars())


def require_mine(conn: Connection, user: CurrentUser, group_ids, message: str = NOT_YOURS) -> None:
    """403 unless every one of these groups is the administrator's faculty's."""
    ids = {pid(g) for g in group_ids}
    if not ids:
        return
    known = set(conn.execute(text("select id from student_group where id = any(cast(:g as bigint[]))"), {"g": list(ids)}).scalars())
    if ids - known:
        raise ApiError(422, "Unknown group")
    if ids - my_group_ids(conn, user):
        raise ApiError(403, message)


def keeps_others(conn: Connection, user: CurrentUser, before, after, message: str = NOT_YOURS) -> None:
    """403 when a list of groups changes in its other-faculty part (one may only add or drop their own)."""
    mine = my_group_ids(conn, user)
    if {pid(g) for g in before} - mine != {pid(g) for g in after} - mine:
        raise ApiError(403, message)
