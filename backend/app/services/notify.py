"""Notifications: stored by kind and params; the client writes the text in the viewer's language."""
import json

from sqlalchemy import Connection, text

from ..util import iso_ts, pid, sid


def notify(conn: Connection, kind: str, params: dict, roles: list[str] | None = None, group_ids: list[str] | None = None, teacher_ids: list[str] | None = None) -> int:
    nid = conn.execute(
        text("insert into notification (kind, params, title, body, roles) values (cast(:k as notification_kind), cast(:p as jsonb), '', '', cast(:r as user_role[])) returning id"),
        {"k": kind, "p": json.dumps(params), "r": roles or []},
    ).scalar_one()
    if group_ids:
        conn.execute(
            text("insert into notification_group (notification_id, group_id) values (:n, :g) on conflict do nothing"),
            [{"n": nid, "g": pid(g)} for g in sorted(set(group_ids))],
        )
    if teacher_ids:
        conn.execute(
            text("insert into notification_teacher (notification_id, teacher_id) values (:n, :t) on conflict do nothing"),
            [{"n": nid, "t": pid(t)} for t in sorted(set(teacher_ids))],
        )
    return nid


def list_for(conn: Connection, user_id: int, role: str) -> list[dict]:
    rows = conn.execute(
        text(
            "select n.id, n.created_at, n.kind::text as kind, n.params, n.title, n.body, n.roles::text[] as roles, "
            "exists (select 1 from notification_read r where r.notification_id = n.id and r.user_id = :u) as read "
            "from notification n order by n.created_at desc, n.id desc"
        ),
        {"u": user_id},
    ).mappings().all()
    groups: dict[int, list[str]] = {}
    teachers: dict[int, list[str]] = {}
    for r in conn.execute(text("select notification_id, group_id from notification_group order by group_id")):
        groups.setdefault(r[0], []).append(sid(r[1]))
    for r in conn.execute(text("select notification_id, teacher_id from notification_teacher order by teacher_id")):
        teachers.setdefault(r[0], []).append(sid(r[1]))
    out = []
    for r in rows:
        if r["roles"] and role not in r["roles"]:
            continue
        n = {"id": sid(r["id"]), "createdAt": iso_ts(r["created_at"]), "title": r["title"], "body": r["body"], "roles": list(r["roles"] or []), "read": r["read"]}
        if r["kind"]:
            n["kind"] = r["kind"]
        if r["params"]:
            n["params"] = r["params"]
        if r["id"] in groups:
            n["groupIds"] = groups[r["id"]]
        if r["id"] in teachers:
            n["teacherIds"] = teachers[r["id"]]
        out.append(n)
    return out


def mark_read(conn: Connection, user_id: int, ids: list[str]) -> None:
    keys = []
    for i in ids:
        try:
            keys.append(int(i))
        except (TypeError, ValueError):
            continue
    if keys:
        conn.execute(
            text("insert into notification_read (notification_id, user_id) select n.id, :u from notification n where n.id = any(cast(:k as bigint[])) on conflict do nothing"),
            {"u": user_id, "k": keys},
        )
