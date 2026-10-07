"""Dataset, settings and the six collections (docs/API.md, Dataset and Collections).

An administrator belongs to one faculty and changes only that faculty's groups, subjects, teachers and rooms.
Records without a faculty (shared teachers, rooms and subjects) can be changed by any administrator."""
from fastapi import APIRouter, Body, Depends, Response
from sqlalchemy import Connection, text

from .. import repo
from ..dataset import build_dataset
from ..deps import CurrentUser, current_user, get_conn, require_admin
from ..errors import ApiError
from ..settings_io import save_settings
from ..util import pid

router = APIRouter(tags=["data"])
OTHER_FACULTY = "This record belongs to another faculty"


@router.get("/dataset")
def get_dataset(conn: Connection = Depends(get_conn)):
    """Public: students and teachers read the timetable without signing in."""
    return build_dataset(conn)


@router.put("/settings")
def put_settings(data: dict = Body(...), _: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    result = save_settings(conn, data)
    conn.commit()
    return result


# ---------------------------------------------------------------- permissions


def _own_faculty_record(conn: Connection, user: CurrentUser, table: str, rid: int | None, data: dict | None) -> None:
    if rid is not None:
        owner = repo.faculty_id_of(conn, table, rid)  # 404 when it does not exist
        if owner is not None and owner != user.faculty_id:
            raise ApiError(403, OTHER_FACULTY)
    if data is not None:
        if rid is None and "faculty" not in data:
            data["faculty"] = user.faculty
        if data.get("faculty") and data["faculty"] != user.faculty:
            raise ApiError(403, "You can only manage your own faculty")


def _groups_in_my_faculty(conn: Connection, user: CurrentUser, group_ids: list[int]) -> bool:
    if not group_ids:
        return False
    return bool(
        conn.execute(
            text("select 1 from student_group where id = any(cast(:g as bigint[])) and faculty_id = :f limit 1"), {"g": group_ids, "f": user.faculty_id}
        ).first()
    )


def _check_stream(conn: Connection, user: CurrentUser, stream_id: int) -> None:
    r = conn.execute(
        text(
            "select s.faculty_id, exists (select 1 from stream_group sg join student_group g on g.id = sg.group_id "
            "where sg.stream_id = s.id and g.faculty_id = :f) as mine from stream s where s.id = :id"
        ),
        {"id": stream_id, "f": user.faculty_id},
    ).first()
    if not r:
        raise ApiError(404, "Not found")
    if r[0] != user.faculty_id and not r[1]:
        raise ApiError(403, OTHER_FACULTY)


def _check_assignment(conn: Connection, user: CurrentUser, assignment_id: int | None, data: dict | None) -> None:
    if assignment_id is not None:
        existing = repo.load_assignments(conn, [assignment_id])
        if not existing:
            raise ApiError(404, "Not found")
        if not _groups_in_my_faculty(conn, user, repo.audience_group_ids(conn, existing[0]["audience"])):
            raise ApiError(403, OTHER_FACULTY)
    if data is not None and not _groups_in_my_faculty(conn, user, repo.audience_group_ids(conn, data["audience"])):
        raise ApiError(403, "An assignment must teach at least one group of your faculty")


# ---------------------------------------------------------------- one save function per collection


def _save_teacher(conn, user, data, rid):
    _own_faculty_record(conn, user, "teacher", rid, data)
    return repo.save_teacher(conn, data, rid)


def _save_room(conn, user, data, rid):
    _own_faculty_record(conn, user, "room", rid, data)
    return repo.save_room(conn, data, rid)


def _save_group(conn, user, data, rid):
    if rid is not None:
        _own_faculty_record(conn, user, "student_group", rid, None)
    if data.get("faculty") and data["faculty"] != user.faculty:
        raise ApiError(403, "You can only manage your own faculty")
    return repo.save_group(conn, data, user.faculty_id, rid)


def _save_stream(conn, user, data, rid):
    if rid is not None:
        _check_stream(conn, user, rid)
    return repo.save_stream(conn, data, user.faculty_id, rid)


def _save_subject(conn, user, data, rid):
    _own_faculty_record(conn, user, "subject", rid, data)
    return repo.save_subject(conn, data, rid)


def _save_assignment(conn, user, data, rid):
    _check_assignment(conn, user, rid, None)
    new_id = repo.save_assignment(conn, data, rid)
    _check_assignment(conn, user, None, repo.load_assignments(conn, [new_id])[0])
    return new_id


SAVERS = {"teachers": _save_teacher, "rooms": _save_room, "groups": _save_group, "streams": _save_stream, "subjects": _save_subject, "assignments": _save_assignment}
TABLES = {"teachers": "teacher", "rooms": "room", "groups": "student_group", "streams": "stream", "subjects": "subject", "assignments": "assignment"}


def _check_delete(conn: Connection, user: CurrentUser, name: str, rid: int) -> None:
    if name == "streams":
        _check_stream(conn, user, rid)
    elif name == "assignments":
        _check_assignment(conn, user, rid, None)
    else:
        _own_faculty_record(conn, user, TABLES[name], rid, None)


def _register(name: str) -> None:
    loader = repo.LOADERS[name]
    saver = SAVERS[name]

    @router.get(f"/{name}", name=f"list_{name}")
    def list_items(_: CurrentUser = Depends(current_user), conn: Connection = Depends(get_conn)):
        return loader(conn)

    @router.post(f"/{name}", status_code=201, name=f"create_{name}")
    def create_item(data: dict = Body(...), user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
        new_id = saver(conn, user, data, None)
        conn.commit()
        return loader(conn, [new_id])[0]

    @router.put(f"/{name}/{{item_id}}", name=f"update_{name}")
    def update_item(item_id: str, data: dict = Body(...), user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
        rid = pid(item_id)
        saver(conn, user, data, rid)
        conn.commit()
        return loader(conn, [rid])[0]

    @router.delete(f"/{name}/{{item_id}}", status_code=204, name=f"delete_{name}")
    def delete_item(item_id: str, user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
        rid = pid(item_id)
        _check_delete(conn, user, name, rid)
        # the database removes the assignments that point at a deleted teacher, subject, group or stream
        if not conn.execute(text(f"delete from {TABLES[name]} where id = :id"), {"id": rid}).rowcount:
            raise ApiError(404, "Not found")
        conn.commit()
        return Response(status_code=204)


for _name in repo.LOADERS:
    _register(_name)


# ---------------------------------------------------------------- extra endpoints


@router.post("/subjects/import", status_code=201)
def import_subjects(data: dict = Body(...), _: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    ids = [repo.save_subject(conn, s, None) for s in data["subjects"]]
    conn.commit()
    return repo.load_subjects(conn, ids)


@router.put("/teachers/{teacher_id}/availability")
def put_availability(teacher_id: str, data: dict = Body(...), user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    tid = pid(teacher_id)
    _own_faculty_record(conn, user, "teacher", tid, None)
    repo.save_availability(conn, tid, data)
    conn.commit()
    return repo.load_teachers(conn, [tid])[0]
