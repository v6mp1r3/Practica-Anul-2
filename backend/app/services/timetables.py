"""Timetables: load, save (with the server-side score), publish and unpublish."""
import json

from sqlalchemy import Connection, text

from ..dataset import build_dataset
from ..deps import CurrentUser
from ..domain.indexes import DatasetIndex
from ..domain.score import SOFT_WEIGHTS, score_timetable
from ..domain.validator import find_hard_conflicts
from ..errors import ApiError
from ..settings_io import current_semester
from ..solver.generate import scope_assignments
from ..util import iso_date, iso_ts, maybe_pid, pid, sid
from .notify import notify

LESSON_COLUMNS = "l.id, l.assignment_id, l.day, l.slot_index, l.room_id, l.parity::text as parity, l.locked, l.lesson_date"


def _lesson_json(r) -> dict:
    l = {"id": sid(r["id"]), "assignmentId": sid(r["assignment_id"]), "day": r["day"], "slot": r["slot_index"], "roomId": sid(r["room_id"]), "parity": r["parity"], "locked": r["locked"]}
    if r["lesson_date"]:
        l["date"] = iso_date(r["lesson_date"])
    return l


def load_lessons(conn: Connection, timetable_id: int) -> list[dict]:
    rows = conn.execute(text(f"select {LESSON_COLUMNS} from lesson l where l.timetable_id = :t order by l.day, l.slot_index, l.id"), {"t": timetable_id}).mappings().all()
    return [_lesson_json(r) for r in rows]


def _load_many(conn: Connection, ids: list[int], with_lessons: bool = True) -> list[dict]:
    """Several timetables in three queries (one round trip each, not three per timetable)."""
    if not ids:
        return []
    rows = conn.execute(
        text("select id, name, status::text as status, algorithm, score_hard, score_soft, score_breakdown, created_at, updated_at from timetable where id = any(cast(:i as bigint[]))"),
        {"i": ids},
    ).mappings().all()
    groups: dict[int, list[str]] = {i: [] for i in ids}
    for tid, gid in conn.execute(text("select timetable_id, group_id from timetable_group where timetable_id = any(cast(:i as bigint[])) order by timetable_id, group_id"), {"i": ids}):
        groups[tid].append(sid(gid))
    lessons: dict[int, list[dict]] = {i: [] for i in ids}
    if with_lessons:
        for r in conn.execute(
            text(f"select l.timetable_id, {LESSON_COLUMNS} from lesson l where l.timetable_id = any(cast(:i as bigint[])) order by l.day, l.slot_index, l.id"), {"i": ids}
        ).mappings():
            lessons[r["timetable_id"]].append(_lesson_json(r))
    by_id = {}
    for r in rows:
        t = {
            "id": sid(r["id"]), "name": r["name"], "status": r["status"], "createdAt": iso_ts(r["created_at"]), "updatedAt": iso_ts(r["updated_at"]),
            "algorithm": r["algorithm"] or "", "groupIds": groups[r["id"]], "lessons": lessons[r["id"]],
        }
        if r["score_hard"] is not None:
            stored = r["score_breakdown"] or {}
            breakdown = {k: stored[k] for k in SOFT_WEIGHTS if k in stored}  # jsonb forgets key order
            t["score"] = {"hard": r["score_hard"], "soft": float(r["score_soft"]), "breakdown": breakdown}
        by_id[r["id"]] = t
    return [by_id[i] for i in ids if i in by_id]


def load_timetable(conn: Connection, timetable_id: int, with_lessons: bool = True) -> dict:
    found = _load_many(conn, [timetable_id], with_lessons)
    if not found:
        raise ApiError(404, "Not found")
    return found[0]


def list_timetables(conn: Connection) -> list[dict]:
    """The current semester's drafts, the published one and variants younger than a day."""
    ids = [
        r[0]
        for r in conn.execute(
            text(
                "select t.id from timetable t join semester s on s.id = t.semester_id and s.is_current "
                "where t.status <> 'variant' or t.created_at > now() - interval '1 day' order by t.created_at desc, t.id desc"
            )
        )
    ]
    return _load_many(conn, ids)


def published_row(conn: Connection) -> int | None:
    return conn.execute(text("select t.id from timetable t join semester s on s.id = t.semester_id and s.is_current where t.status = 'published'")).scalar()


def get_published(conn: Connection) -> dict | None:
    tid = published_row(conn)
    return load_timetable(conn, tid) if tid else None


# ---------------------------------------------------------------- lessons


def _sync_lessons(conn: Connection, tid: int, lessons: list[dict]) -> None:
    """Make the timetable hold exactly these lessons. Lessons that already exist (numeric id of this timetable)
    keep their id, so exam events that point at them stay valid; the others are inserted."""
    existing = {r[0] for r in conn.execute(text("select id from lesson where timetable_id = :t"), {"t": tid})}
    keep: set[int] = set()
    upd, new = [], []
    for l in lessons:
        lid = maybe_pid(l.get("id"))
        row = (pid(l["assignmentId"]), l["day"], l["slot"], pid(l["roomId"]), l.get("parity") or "weekly", bool(l.get("locked")), l.get("date"))
        if lid in existing and lid not in keep:
            keep.add(lid)
            upd.append((lid, *row))
        else:
            new.append(row)
    conn.execute(text("delete from lesson where timetable_id = :t and not (id = any(cast(:k as bigint[])))"), {"t": tid, "k": sorted(keep)})
    cols = list(zip(*upd)) if upd else None
    if cols:
        conn.execute(
            text(
                "update lesson l set assignment_id = v.a, day = v.d, slot_index = v.s, room_id = v.r, parity = cast(v.p as parity), locked = v.k, lesson_date = v.dt "
                "from unnest(cast(:id as bigint[]), cast(:a as bigint[]), cast(:d as smallint[]), cast(:s as smallint[]), cast(:r as bigint[]), cast(:p as text[]), cast(:k as boolean[]), cast(:dt as date[])) "
                "as v(id, a, d, s, r, p, k, dt) where l.id = v.id and l.timetable_id = :t"
            ),
            {"t": tid, "id": list(cols[0]), "a": list(cols[1]), "d": list(cols[2]), "s": list(cols[3]), "r": list(cols[4]), "p": list(cols[5]), "k": list(cols[6]), "dt": list(cols[7])},
        )
    _insert_lessons(conn, tid, new)


def _insert_lessons(conn: Connection, tid: int, rows: list[tuple]) -> None:
    """rows: (assignment id, day, slot, room id, parity, locked, date)"""
    if not rows:
        return
    cols = list(zip(*rows))
    conn.execute(
        text(
            "insert into lesson (timetable_id, assignment_id, day, slot_index, room_id, parity, locked, lesson_date) "
            "select :t, a, d, s, r, cast(p as parity), k, dt from unnest(cast(:a as bigint[]), cast(:d as smallint[]), cast(:s as smallint[]), cast(:r as bigint[]), "
            "cast(:p as text[]), cast(:k as boolean[]), cast(:dt as date[])) as v(a, d, s, r, p, k, dt)"
        ),
        {"t": tid, "a": list(cols[0]), "d": list(cols[1]), "s": list(cols[2]), "r": list(cols[3]), "p": list(cols[4]), "k": list(cols[5]), "dt": list(cols[6])},
    )


def _set_groups(conn: Connection, tid: int, group_ids: list[int]) -> None:
    conn.execute(text("delete from timetable_group where timetable_id = :t"), {"t": tid})
    if group_ids:
        conn.execute(text("insert into timetable_group (timetable_id, group_id) values (:t, :g)"), [{"t": tid, "g": g} for g in sorted(set(group_ids))])


def _store_score(conn: Connection, tid: int, ds: dict | None = None) -> None:
    """Scored against the loads of its own groups (like the editor): a timetable of some groups, e.g. one
    imported for a year of study, is not missing the pairs of all the others."""
    ds = ds or build_dataset(conn)
    lessons = load_lessons(conn, tid)
    group_ids = [sid(g[0]) for g in conn.execute(text("select group_id from timetable_group where timetable_id = :t"), {"t": tid})]
    if group_ids:
        idx = DatasetIndex(ds)
        ds = {**ds, "assignments": scope_assignments(ds, idx, group_ids)}
    score = score_timetable(ds, lessons)
    conn.execute(
        text("update timetable set score_hard = :h, score_soft = :s, score_breakdown = cast(:b as jsonb) where id = :t"),
        {"t": tid, "h": score["hard"], "s": score["soft"], "b": json.dumps(score["breakdown"])},
    )


# ---------------------------------------------------------------- save


def save_timetable(conn: Connection, path_id: str, data: dict, user: CurrentUser) -> dict:
    """PUT /timetables/{id}: create or update. A variant becomes a draft; the score is recomputed here."""
    sem = current_semester(conn)
    tid = maybe_pid(path_id)
    exists = tid is not None and conn.execute(text("select 1 from timetable where id = :id"), {"id": tid}).first() is not None
    status = data.get("status", "draft")
    group_ids = [pid(g) for g in data.get("groupIds") or []]
    if exists:
        current = conn.execute(text("select status::text from timetable where id = :id"), {"id": tid}).scalar_one()
        new_status = current if current == "published" else ("draft" if status in ("variant", "published") else status)
        conn.execute(
            text("update timetable set name = :n, algorithm = :a, status = cast(:s as timetable_status) where id = :id"),
            {"id": tid, "n": data["name"], "a": data.get("algorithm") or None, "s": new_status},
        )
    else:
        tid = conn.execute(
            text("insert into timetable (semester_id, name, algorithm, status, created_by) values (:sem, :n, :a, cast(:s as timetable_status), :u) returning id"),
            {"sem": sem.id, "n": data["name"], "a": data.get("algorithm") or None, "s": "draft" if status in ("variant", "published") else status, "u": user.id},
        ).scalar_one()
    _set_groups(conn, tid, group_ids)
    _sync_lessons(conn, tid, data.get("lessons") or [])
    _store_score(conn, tid)
    conn.commit()
    return load_timetable(conn, tid)


def delete_timetable(conn: Connection, path_id: str) -> None:
    tid = maybe_pid(path_id)
    if tid is None or not conn.execute(text("delete from timetable where id = :id"), {"id": tid}).rowcount:
        raise ApiError(404, "Not found")
    conn.commit()


# ---------------------------------------------------------------- publish


def _groups_of(idx: DatasetIndex, assignment_id: str) -> set[str]:
    a = idx.assignments.get(assignment_id)
    if not a:
        return set()
    if a["audience"]["kind"] == "stream":
        return set(idx.streams.get(a["audience"]["id"], {}).get("groupIds", []))
    return {a["audience"]["id"]}


def _lesson_key(l: dict) -> str:
    return f"{l['assignmentId']}|{l['day']}|{l['slot']}|{l['roomId']}|{l['parity']}"


def _copy_lessons(conn: Connection, tid: int, lessons: list[dict]) -> None:
    _insert_lessons(conn, tid, [(pid(l["assignmentId"]), l["day"], l["slot"], pid(l["roomId"]), l["parity"], bool(l.get("locked")), l.get("date")) for l in lessons])


def publish(conn: Connection, path_id: str) -> dict:
    tid = maybe_pid(path_id)
    if tid is None:
        raise ApiError(404, "Not found")
    t = load_timetable(conn, tid)
    prev_id = published_row(conn)
    prev = load_timetable(conn, prev_id) if prev_id else None
    ds = build_dataset(conn)
    idx = DatasetIndex(ds)
    count = len(t["lessons"])
    if prev and prev["id"] != t["id"]:
        # only this timetable's groups are replaced; other faculties' published pairs stay
        mine = set(t["groupIds"])
        touches = lambda l: bool(_groups_of(idx, l["assignmentId"]) & mine)
        own = [l for l in t["lessons"] if touches(l)]
        rest = [l for l in prev["lessons"] if not touches(l)]
        merged = rest + own
        own_ids = {l["id"] for l in own}
        clashes = [
            c
            for c in find_hard_conflicts(ds, merged, idx)
            if c["kind"] in ("room-clash", "teacher-clash", "group-clash")
            and any(i in own_ids for i in c["lessonIds"])
            and any(i not in own_ids for i in c["lessonIds"])
        ]
        if clashes:
            raise ApiError(409, f"{len(clashes)} clash(es) with pairs another faculty has published")
        conn.execute(text("update timetable set status = 'draft' where id = :id"), {"id": prev_id})
        conn.execute(text("delete from lesson where timetable_id = :t and not (id = any(cast(:k as bigint[])))"), {"t": tid, "k": [int(l["id"]) for l in own]})
        _copy_lessons(conn, tid, rest)
        _set_groups(conn, tid, [int(g) for g in set(prev["groupIds"]) | set(t["groupIds"])])
        before = {_lesson_key(l) for l in prev["lessons"]}
        count = sum(1 for l in merged if _lesson_key(l) not in before)
    elif prev:
        count = 0  # publishing the one that is already published changes nothing
    conn.execute(text("update timetable set status = 'published' where id = :id"), {"id": tid})
    _store_score(conn, tid, ds)
    name = t["name"]
    if prev:
        notify(conn, "updated", {"name": name, "count": count})
    else:
        notify(conn, "published", {"name": name})
    conn.commit()
    return load_timetable(conn, tid)


def unpublish(conn: Connection, path_id: str, user: CurrentUser) -> dict:
    tid = maybe_pid(path_id)
    if tid is None:
        raise ApiError(404, "Not found")
    t = load_timetable(conn, tid)
    if t["status"] != "published":
        raise ApiError(409, "Not published")
    ds = build_dataset(conn)
    idx = DatasetIndex(ds)
    # a faculty administrator withdraws only their own faculty's groups
    mine = {g for g in t["groupIds"] if user.faculty is None or idx.groups.get(g, {}).get("faculty") == user.faculty}
    if not mine:
        raise ApiError(403, "None of these groups belong to your faculty")
    touches = lambda l: bool(_groups_of(idx, l["assignmentId"]) & mine)
    withdrawn = [l for l in t["lessons"] if touches(l)]
    if len(mine) == len(t["groupIds"]):
        conn.execute(text("update timetable set status = 'draft' where id = :id"), {"id": tid})
        result_id = tid
    else:
        # the other faculties keep their published pairs; ours come back as a separate draft
        sem = current_semester(conn)
        result_id = conn.execute(
            text("insert into timetable (semester_id, name, algorithm, status, created_by) values (:s, :n, :a, 'draft', :u) returning id"),
            {"s": sem.id, "n": t["name"], "a": t["algorithm"] or None, "u": user.id},
        ).scalar_one()
        _set_groups(conn, result_id, [int(g) for g in mine])
        _copy_lessons(conn, result_id, withdrawn)
        _store_score(conn, result_id, ds)
        conn.execute(text("delete from lesson where timetable_id = :t and id = any(cast(:k as bigint[]))"), {"t": tid, "k": [int(l["id"]) for l in withdrawn]})
        conn.execute(text("delete from timetable_group where timetable_id = :t and group_id = any(cast(:g as bigint[]))"), {"t": tid, "g": [int(g) for g in mine]})
        _store_score(conn, tid, ds)
    teachers = {idx.assignments[l["assignmentId"]]["teacherId"] for l in withdrawn if l["assignmentId"] in idx.assignments}
    notify(conn, "unpublished", {"name": t["name"]}, group_ids=sorted(mine), teacher_ids=sorted(teachers))
    conn.commit()
    return load_timetable(conn, result_id)


def create_timetable(conn: Connection, semester_id: int, name: str, status: str, algorithm: str, group_ids: list[int], lessons: list[dict], score: dict | None, user_id: int | None) -> int:
    """Insert a whole timetable (used for the variants the solver makes). The score is stored as given."""
    tid = conn.execute(
        text("insert into timetable (semester_id, name, algorithm, status, created_by) values (:s, :n, :a, cast(:st as timetable_status), :u) returning id"),
        {"s": semester_id, "n": name, "a": algorithm, "st": status, "u": user_id},
    ).scalar_one()
    _set_groups(conn, tid, group_ids)
    _copy_lessons(conn, tid, lessons)
    if score:
        conn.execute(
            text("update timetable set score_hard = :h, score_soft = :s, score_breakdown = cast(:b as jsonb) where id = :t"),
            {"t": tid, "h": score["hard"], "s": score["soft"], "b": json.dumps(score["breakdown"])},
        )
    return tid
