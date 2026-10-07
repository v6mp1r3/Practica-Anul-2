"""One-off schedule changes for a date (docs/API.md, Schedule changes)."""
from fastapi import APIRouter, Body, Depends, Response
from sqlalchemy import Connection, text

from ..dataset import build_dataset
from ..deps import CurrentUser, get_conn, require_admin
from ..domain.changes import free_rooms_for, free_teachers_for, lesson_of_change
from ..domain.indexes import DatasetIndex
from ..errors import ApiError
from ..services.notify import notify
from ..services.timetables import get_published
from ..util import iso_date, iso_ts, parse_date, pid, sid

router = APIRouter(prefix="/changes", tags=["changes"])


def _json(r) -> dict:
    c = {
        "id": sid(r["id"]), "date": iso_date(r["change_date"]), "assignmentId": sid(r["assignment_id"]), "slot": r["slot_index"], "kind": r["kind"],
        "fromRoomId": sid(r["from_room_id"]), "createdAt": iso_ts(r["created_at"]),
    }
    if r["room_id"] is not None:
        c["roomId"] = sid(r["room_id"])
    if r["teacher_id"] is not None:
        c["teacherId"] = sid(r["teacher_id"])
    if r["note"]:
        c["note"] = r["note"]
    return c


def load_changes(conn: Connection, ids: list[int] | None = None) -> list[dict]:
    where = " where id = any(cast(:ids as bigint[]))" if ids is not None else ""
    rows = conn.execute(
        text(
            "select id, change_date, assignment_id, slot_index, kind::text as kind, from_room_id, room_id, teacher_id, note, created_at "
            f"from schedule_change{where} order by change_date, slot_index, id"
        ),
        {"ids": ids} if ids is not None else {},
    ).mappings().all()
    return [_json(r) for r in rows]


@router.get("")
def list_changes(conn: Connection = Depends(get_conn)):
    """Public."""
    return load_changes(conn)


@router.post("", status_code=201)
def create_change(data: dict = Body(...), _: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    parse_date(data["date"])
    kind = data["kind"]
    published = get_published(conn)
    if not published:
        raise ApiError(422, "There is no published timetable")
    ds = build_dataset(conn)
    idx = DatasetIndex(ds)
    lesson = lesson_of_change(ds, published["lessons"], {"date": data["date"], "assignmentId": str(data["assignmentId"]), "slot": data["slot"]})
    if not lesson:
        raise ApiError(422, "That pair does not take place on that date in the published timetable")
    if str(data["fromRoomId"]) != lesson["roomId"]:
        raise ApiError(422, "fromRoomId is not the room the pair is planned in")
    existing = load_changes(conn)
    if kind == "room":
        room_id = data.get("roomId")
        if room_id is None or str(room_id) not in {r["id"] for r in free_rooms_for(ds, idx, published["lessons"], existing, data["date"], lesson)}:
            raise ApiError(422, "That room is busy then or does not fit the pair")
        teacher_id = None
    elif kind == "teacher":
        teacher_id = data.get("teacherId")
        if teacher_id is None or str(teacher_id) not in {t["id"] for t in free_teachers_for(ds, idx, published["lessons"], existing, data["date"], lesson)}:
            raise ApiError(422, "That teacher is busy then or unavailable")
        room_id = None
    else:
        raise ApiError(422, "kind must be 'room' or 'teacher'")
    new_id = conn.execute(
        text(
            "insert into schedule_change (change_date, assignment_id, slot_index, kind, from_room_id, room_id, teacher_id, note) "
            "values (cast(:d as date), :a, :s, cast(:k as change_kind), :f, :r, :t, :n) returning id"
        ),
        {"d": data["date"], "a": pid(data["assignmentId"]), "s": data["slot"], "k": kind, "f": pid(data["fromRoomId"]),
         "r": pid(room_id) if room_id is not None else None, "t": pid(teacher_id) if teacher_id is not None else None, "n": data.get("note") or None},
    ).scalar_one()
    a = idx.assignments[str(data["assignmentId"])]
    groups = idx.streams.get(a["audience"]["id"], {}).get("groupIds", []) if a["audience"]["kind"] == "stream" else [a["audience"]["id"]]
    teachers = [a["teacherId"]] + ([str(teacher_id)] if teacher_id is not None else [])
    params = {"assignmentId": str(data["assignmentId"]), "date": data["date"], "slot": data["slot"], "fromRoomId": str(data["fromRoomId"])}
    if room_id is not None:
        params["roomId"] = str(room_id)
    if teacher_id is not None:
        params["teacherId"] = str(teacher_id)
    if data.get("note"):
        params["note"] = data["note"]
    notify(conn, "room-change" if kind == "room" else "teacher-change", params, group_ids=groups, teacher_ids=teachers)
    conn.commit()
    return load_changes(conn, [new_id])[0]


@router.delete("/{change_id}", status_code=204)
def delete_change(change_id: str, _: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    if not conn.execute(text("delete from schedule_change where id = :id"), {"id": pid(change_id)}).rowcount:
        raise ApiError(404, "Not found")
    conn.commit()
    return Response(status_code=204)
