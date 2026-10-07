"""Exam and atestări timetables, one plan per faculty and round (docs/API.md, Exams).
Generating a plan needs the solver, so that endpoint answers 501 for now."""
from typing import Literal

from fastapi import APIRouter, Body, Depends, Response
from sqlalchemy import Connection, text

from ..deps import CurrentUser, get_conn, require_admin
from ..errors import ApiError
from ..settings_io import current_semester
from ..util import hhmm, iso_date, iso_ts, maybe_pid, pid, sid

router = APIRouter(prefix="/exams", tags=["exams"])
Round = Literal["midterm1", "midterm2", "session", "remidterm1", "remidterm2", "reexam"]


def _event(r) -> dict:
    e = {
        "id": sid(r["id"]), "kind": r["kind"], "round": r["round"], "subjectId": sid(r["subject_id"]), "groupId": sid(r["group_id"]),
        "teacherId": sid(r["teacher_id"]), "roomId": sid(r["room_id"]), "date": iso_date(r["event_date"]), "start": hhmm(r["start_time"]), "end": hhmm(r["end_time"]),
    }
    if r["lesson_id"] is not None:
        e["lessonId"] = sid(r["lesson_id"])
    if r["subgroup_no"] is not None:
        e["subgroup"] = r["subgroup_no"]
    return e


def _events(conn: Connection, where: str, params: dict) -> list[dict]:
    rows = conn.execute(
        text(
            "select e.id, e.kind::text as kind, p.round::text as round, e.subject_id, e.group_id, e.teacher_id, e.room_id, e.event_date, e.start_time, e.end_time, e.lesson_id, e.subgroup_no "
            f"from exam_event e join exam_plan p on p.id = e.plan_id where {where} order by e.event_date, e.start_time, e.id"
        ),
        params,
    ).mappings().all()
    return [_event(r) for r in rows]


def _plan(conn: Connection, plan_id: int) -> dict:
    r = conn.execute(
        text("select p.id, f.name as faculty, p.round::text as round, p.status::text as status, p.updated_at from exam_plan p join faculty f on f.id = p.faculty_id where p.id = :id"), {"id": plan_id}
    ).mappings().first()
    return {"faculty": r["faculty"], "round": r["round"], "status": r["status"], "events": _events(conn, "e.plan_id = :p", {"p": plan_id}), "updatedAt": iso_ts(r["updated_at"])}


def _find(conn: Connection, user: CurrentUser, round_: str) -> int | None:
    sem = current_semester(conn)
    return conn.execute(
        text("select id from exam_plan where semester_id = :s and faculty_id = :f and round = cast(:r as exam_round)"), {"s": sem.id, "f": user.faculty_id, "r": round_}
    ).scalar()


@router.get("")
def list_published(conn: Connection = Depends(get_conn)):
    """Public: the events of every faculty's published plans."""
    sem = current_semester(conn)
    return _events(conn, "p.semester_id = :s and p.status = 'published'", {"s": sem.id})


@router.get("/plans")
def list_plans(user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    sem = current_semester(conn)
    ids = [r[0] for r in conn.execute(text("select id from exam_plan where semester_id = :s and faculty_id = :f order by round, id"), {"s": sem.id, "f": user.faculty_id})]
    return [_plan(conn, i) for i in ids]


@router.get("/plans/{round_}")
def get_plan(round_: Round, user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    plan_id = _find(conn, user, round_)
    return _plan(conn, plan_id) if plan_id else None


@router.put("/plans/{round_}")
def save_plan(round_: Round, data: dict = Body(...), user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    plan_id = _find(conn, user, round_)
    if plan_id is None:
        sem = current_semester(conn)
        plan_id = conn.execute(
            text("insert into exam_plan (semester_id, faculty_id, round) values (:s, :f, cast(:r as exam_round)) returning id"), {"s": sem.id, "f": user.faculty_id, "r": round_}
        ).scalar_one()
    else:
        conn.execute(text("update exam_plan set updated_at = now() where id = :id"), {"id": plan_id})
    conn.execute(text("delete from exam_event where plan_id = :p"), {"p": plan_id})
    rows = []
    for e in data.get("events") or []:
        lesson = maybe_pid(e.get("lessonId"))
        if lesson is not None and not conn.execute(text("select 1 from lesson where id = :id"), {"id": lesson}).first():
            lesson = None
        rows.append({"p": plan_id, "k": e["kind"], "s": pid(e["subjectId"]), "g": pid(e["groupId"]), "t": pid(e["teacherId"]), "r": pid(e["roomId"]),
                     "d": e["date"], "a": e["start"], "b": e["end"], "l": lesson, "sg": e.get("subgroup")})
    if rows:
        conn.execute(
            text(
                "insert into exam_event (plan_id, kind, subject_id, group_id, teacher_id, room_id, event_date, start_time, end_time, lesson_id, subgroup_no) "
                "values (:p, cast(:k as exam_event_kind), :s, :g, :t, :r, cast(:d as date), cast(:a as time), cast(:b as time), :l, :sg)"
            ),
            rows,
        )
    conn.commit()
    return _plan(conn, plan_id)


@router.delete("/plans/{round_}", status_code=204)
def delete_plan(round_: Round, user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    plan_id = _find(conn, user, round_)
    if plan_id:
        conn.execute(text("delete from exam_plan where id = :id"), {"id": plan_id})
        conn.commit()
    return Response(status_code=204)


@router.post("/plans/{round_}/generate")
def generate_plan(round_: Round, _: CurrentUser = Depends(require_admin)):
    raise ApiError(501, "Exam generation is not available yet: the solver is not built")


def _set_status(conn: Connection, user: CurrentUser, round_: str, status: str) -> dict:
    plan_id = _find(conn, user, round_)
    if not plan_id:
        raise ApiError(404, "Not found")
    conn.execute(text("update exam_plan set status = cast(:s as plan_status) where id = :id"), {"s": status, "id": plan_id})
    conn.commit()
    return _plan(conn, plan_id)


@router.post("/plans/{round_}/publish")
def publish_plan(round_: Round, user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    return _set_status(conn, user, round_, "published")


@router.post("/plans/{round_}/unpublish")
def unpublish_plan(round_: Round, user: CurrentUser = Depends(require_admin), conn: Connection = Depends(get_conn)):
    return _set_status(conn, user, round_, "draft")
