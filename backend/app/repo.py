"""Reading and writing the six collections (teachers, rooms, groups, streams, subjects, assignments).

Loaders return the JSON shapes of docs/API.md (ids are strings). Savers take that same JSON and return the
database id. Faculties are sent by name, so they are translated to ids here.
"""
import re
from collections import defaultdict
from decimal import Decimal
from typing import Any, Iterable

from sqlalchemy import Connection, text

from .errors import ApiError
from .util import iso_date, maybe_pid, pid, sid

# ---------------------------------------------------------------- helpers


def num(x: Any) -> int | float | None:
    """numeric -> JSON number (2 instead of 2.0)."""
    if x is None:
        return None
    f = float(x) if isinstance(x, Decimal) else x
    return int(f) if float(f).is_integer() else float(f)


def _ids_clause(column: str, ids: Iterable[int] | None) -> tuple[str, dict]:
    if ids is None:
        return "", {}
    return f" where {column} = any(cast(:ids as bigint[]))", {"ids": list(ids)}


def _all(conn: Connection, sql: str, params: dict | None = None) -> list[dict]:
    return [dict(r) for r in conn.execute(text(sql), params or {}).mappings().all()]


def faculty_id_by_name(conn: Connection, name: str | None) -> int | None:
    if not name:
        return None
    row = conn.execute(text("select id from faculty where name = :n"), {"n": name}).first()
    if not row:
        raise ApiError(422, f"Unknown faculty: {name}")
    return row[0]


def faculty_id_of(conn: Connection, table: str, rid: int) -> int | None:
    """Faculty of a record (tables with a faculty_id column), for permission checks."""
    row = conn.execute(text(f"select faculty_id from {table} where id = :id"), {"id": rid}).first()
    if row is None:
        raise ApiError(404, "Not found")
    return row[0]


def ensure_equipment(conn: Connection, names: list[str]) -> list[int]:
    names = sorted({n.strip() for n in names if n and n.strip()})
    ids: list[int] = []
    for n in names:
        conn.execute(text("insert into equipment (name) values (:n) on conflict (name) do nothing"), {"n": n})
        ids.append(conn.execute(text("select id from equipment where name = :n"), {"n": n}).scalar_one())
    return ids


def _replace(conn: Connection, table: str, key: str, key_value: int, columns: list[str], rows: list[tuple]) -> None:
    conn.execute(text(f"delete from {table} where {key} = :k"), {"k": key_value})
    if rows:
        cols = ", ".join([key] + columns)
        vals = ", ".join([":k"] + [f":{c}" for c in columns])
        conn.execute(text(f"insert into {table} ({cols}) values ({vals})"), [{"k": key_value, **dict(zip(columns, r))} for r in rows])


def _slot_parts(key: str) -> tuple[int, int]:
    try:
        d, s = key.split(":")
        return int(d), int(s)
    except ValueError:
        raise ApiError(422, f"Invalid slot key: {key!r}")


# ---------------------------------------------------------------- teachers


def load_teachers(conn: Connection, ids: Iterable[int] | None = None) -> list[dict]:
    where, p = _ids_clause("t.id", ids)
    rows = _all(
        conn,
        "select t.id, t.name, t.title, t.department, f.name as faculty, t.email, t.max_pairs_per_week "
        f"from teacher t left join faculty f on f.id = t.faculty_id{where} order by t.id",
        p,
    )
    if not rows:
        return []
    keys = [r["id"] for r in rows]
    types: dict[int, list[str]] = defaultdict(list)
    for r in _all(conn, "select teacher_id, activity_type::text as v from teacher_activity_type where teacher_id = any(cast(:k as bigint[])) order by activity_type", {"k": keys}):
        types[r["teacher_id"]].append(r["v"])
    prefs: dict[tuple[int, str], list[str]] = defaultdict(list)
    for r in _all(conn, "select teacher_id, kind::text as kind, day, slot_index from teacher_slot_pref where teacher_id = any(cast(:k as bigint[])) order by day, slot_index", {"k": keys}):
        prefs[(r["teacher_id"], r["kind"])].append(f"{r['day']}:{r['slot_index']}")
    exams: dict[int, list[str]] = defaultdict(list)
    for r in _all(conn, "select teacher_id, date, part from teacher_exam_unavailability where teacher_id = any(cast(:k as bigint[])) order by date, part", {"k": keys}):
        d = iso_date(r["date"])
        exams[r["teacher_id"]].append(d if r["part"] == "day" else f"{d}|{r['part']}")
    out = []
    for r in rows:
        t = {
            "id": sid(r["id"]),
            "name": r["name"],
            "title": r["title"] or "",
            "department": r["department"] or "",
            "email": r["email"] or "",
            "maxPairsPerWeek": num(r["max_pairs_per_week"]),
            "activityTypes": types[r["id"]],
            "unavailable": prefs[(r["id"], "unavailable")],
            "preferred": prefs[(r["id"], "preferred")],
            "examUnavailable": exams[r["id"]],
        }
        if r["faculty"]:
            t["faculty"] = r["faculty"]
        cons = prefs[(r["id"], "consultation")]
        if cons:
            t["consultation"] = cons[0]
        out.append(t)
    return out


def _save_slot_prefs(conn: Connection, tid: int, unavailable: list[str], preferred: list[str], consultation: str | None) -> None:
    rows: dict[tuple[int, int, str], None] = {}
    for kind, keys in (("unavailable", unavailable), ("preferred", preferred), ("consultation", [consultation] if consultation else [])):
        for k in keys:
            d, s = _slot_parts(k)
            rows[(d, s, kind)] = None
    conn.execute(text("delete from teacher_slot_pref where teacher_id = :t"), {"t": tid})
    if rows:
        conn.execute(
            text("insert into teacher_slot_pref (teacher_id, day, slot_index, kind) values (:t, :d, :s, cast(:k as slot_pref_kind))"),
            [{"t": tid, "d": d, "s": s, "k": k} for (d, s, k) in rows],
        )


def save_teacher(conn: Connection, data: dict, tid: int | None = None) -> int:
    fid = faculty_id_by_name(conn, data.get("faculty"))
    params = {
        "name": data["name"], "title": data.get("title") or None, "department": data.get("department") or None,
        "fid": fid, "email": data.get("email") or None, "max": data["maxPairsPerWeek"],
    }
    if tid is None:
        tid = conn.execute(
            text("insert into teacher (name, title, department, faculty_id, email, max_pairs_per_week) values (:name, :title, :department, :fid, :email, :max) returning id"),
            params,
        ).scalar_one()
    else:
        n = conn.execute(
            text("update teacher set name=:name, title=:title, department=:department, faculty_id=:fid, email=:email, max_pairs_per_week=:max where id=:id"),
            {**params, "id": tid},
        ).rowcount
        if not n:
            raise ApiError(404, "Not found")
    conn.execute(text("delete from teacher_activity_type where teacher_id = :t"), {"t": tid})
    types = sorted(set(data.get("activityTypes") or []))
    if types:
        conn.execute(
            text("insert into teacher_activity_type (teacher_id, activity_type) values (:t, cast(:a as activity_type))"),
            [{"t": tid, "a": a} for a in types],
        )
    _save_slot_prefs(conn, tid, data.get("unavailable") or [], data.get("preferred") or [], data.get("consultation"))
    conn.execute(text("delete from teacher_exam_unavailability where teacher_id = :t"), {"t": tid})
    ex: dict[tuple[str, str], None] = {}
    for item in data.get("examUnavailable") or []:
        day, _, part = item.partition("|")
        ex[(day, part or "day")] = None
    if ex:
        conn.execute(
            text("insert into teacher_exam_unavailability (teacher_id, date, part) values (:t, cast(:d as date), :p)"),
            [{"t": tid, "d": d, "p": p} for (d, p) in ex],
        )
    return tid


def save_availability(conn: Connection, tid: int, data: dict) -> None:
    if not conn.execute(text("select 1 from teacher where id = :id"), {"id": tid}).first():
        raise ApiError(404, "Not found")
    _save_slot_prefs(conn, tid, data.get("unavailable") or [], data.get("preferred") or [], data.get("consultation"))


# ---------------------------------------------------------------- rooms


def load_rooms(conn: Connection, ids: Iterable[int] | None = None) -> list[dict]:
    where, p = _ids_clause("r.id", ids)
    rows = _all(
        conn,
        "select r.id, r.name, r.building, f.name as faculty, r.capacity, r.room_type::text as type "
        f"from room r left join faculty f on f.id = r.faculty_id{where} order by r.id",
        p,
    )
    if not rows:
        return []
    keys = [r["id"] for r in rows]
    equip: dict[int, list[str]] = defaultdict(list)
    for r in _all(conn, "select re.room_id, e.name from room_equipment re join equipment e on e.id = re.equipment_id where re.room_id = any(cast(:k as bigint[])) order by e.name", {"k": keys}):
        equip[r["room_id"]].append(r["name"])
    subj: dict[int, list[str]] = defaultdict(list)
    for r in _all(conn, "select room_id, subject_id from room_preferred_subject where room_id = any(cast(:k as bigint[])) order by subject_id", {"k": keys}):
        subj[r["room_id"]].append(sid(r["subject_id"]))
    grp: dict[int, list[str]] = defaultdict(list)
    for r in _all(conn, "select room_id, group_id from room_preferred_group where room_id = any(cast(:k as bigint[])) order by group_id", {"k": keys}):
        grp[r["room_id"]].append(sid(r["group_id"]))
    out = []
    for r in rows:
        room = {"id": sid(r["id"]), "name": r["name"], "building": r["building"], "capacity": r["capacity"], "type": r["type"], "equipment": equip[r["id"]]}
        if r["faculty"]:
            room["faculty"] = r["faculty"]
        if subj[r["id"]]:
            room["preferredSubjectIds"] = subj[r["id"]]
        if grp[r["id"]]:
            room["preferredGroupIds"] = grp[r["id"]]
        out.append(room)
    return out


def save_room(conn: Connection, data: dict, rid: int | None = None) -> int:
    params = {
        "name": data["name"], "building": data.get("building") or "", "fid": faculty_id_by_name(conn, data.get("faculty")),
        "cap": data["capacity"], "type": data["type"],
    }
    if rid is None:
        rid = conn.execute(
            text("insert into room (name, building, faculty_id, capacity, room_type) values (:name, :building, :fid, :cap, cast(:type as room_type)) returning id"), params
        ).scalar_one()
    else:
        n = conn.execute(
            text("update room set name=:name, building=:building, faculty_id=:fid, capacity=:cap, room_type=cast(:type as room_type) where id=:id"),
            {**params, "id": rid},
        ).rowcount
        if not n:
            raise ApiError(404, "Not found")
    _replace(conn, "room_equipment", "room_id", rid, ["equipment_id"], [(e,) for e in ensure_equipment(conn, data.get("equipment") or [])])
    _replace(conn, "room_preferred_subject", "room_id", rid, ["subject_id"], [(pid(s),) for s in sorted(set(data.get("preferredSubjectIds") or []))])
    _replace(conn, "room_preferred_group", "room_id", rid, ["group_id"], [(pid(g),) for g in sorted(set(data.get("preferredGroupIds") or []))])
    return rid


# ---------------------------------------------------------------- groups


def load_groups(conn: Connection, ids: Iterable[int] | None = None) -> list[dict]:
    where, p = _ids_clause("g.id", ids)
    rows = _all(
        conn,
        "select g.id, g.name, g.program, f.name as faculty, g.cycle::text as cycle, g.year, g.program_years, g.study_form::text as study_form, "
        f"g.language::text as language, g.size, g.subgroups from student_group g join faculty f on f.id = g.faculty_id{where} order by g.id",
        p,
    )
    return [
        {
            "id": sid(r["id"]), "name": r["name"], "program": r["program"], "faculty": r["faculty"], "year": r["year"], "cycle": r["cycle"],
            "programYears": r["program_years"], "size": r["size"], "studyForm": r["study_form"], "subgroups": r["subgroups"], "language": r["language"],
        }
        for r in rows
    ]


def save_group(conn: Connection, data: dict, default_faculty_id: int | None, gid: int | None = None) -> int:
    fid = faculty_id_by_name(conn, data.get("faculty")) or default_faculty_id
    if fid is None:
        raise ApiError(422, "A group needs a faculty")
    year = data["year"]
    cycle = data.get("cycle") or "licenta"
    program_years = data.get("programYears") or (max(4, year) if cycle == "licenta" else max(2, year))
    params = {
        "name": data["name"].strip().upper(), "program": data.get("program") or "", "fid": fid, "cycle": cycle,
        "year": year, "py": program_years,
        "form": data.get("studyForm") or "full", "lang": data.get("language") or "ro", "size": data["size"], "sub": data.get("subgroups") or 1,
    }
    sql_cols = "name=:name, program=:program, faculty_id=:fid, cycle=cast(:cycle as study_cycle), year=:year, program_years=:py, study_form=cast(:form as study_form), language=cast(:lang as study_language), size=:size, subgroups=:sub"
    if gid is None:
        return conn.execute(
            text("insert into student_group (name, program, faculty_id, cycle, year, program_years, study_form, language, size, subgroups) "
                 "values (:name, :program, :fid, cast(:cycle as study_cycle), :year, :py, cast(:form as study_form), cast(:lang as study_language), :size, :sub) returning id"),
            params,
        ).scalar_one()
    if not conn.execute(text(f"update student_group set {sql_cols} where id=:id"), {**params, "id": gid}).rowcount:
        raise ApiError(404, "Not found")
    return gid


# ---------------------------------------------------------------- streams


def load_streams(conn: Connection, ids: Iterable[int] | None = None) -> list[dict]:
    where, p = _ids_clause("s.id", ids)
    rows = _all(conn, f"select s.id, s.name, s.origin::text as origin, s.subject_id from stream s{where} order by s.id", p)
    if not rows:
        return []
    members: dict[int, list[str]] = defaultdict(list)
    for r in _all(conn, "select stream_id, group_id from stream_group where stream_id = any(cast(:k as bigint[])) order by group_id", {"k": [r["id"] for r in rows]}):
        members[r["stream_id"]].append(sid(r["group_id"]))
    # subjectId: the subject an automatic stream belongs to (None for a predefined stream like FAF)
    return [
        {"id": sid(r["id"]), "name": r["name"] or "", "groupIds": members[r["id"]], "subjectId": sid(r["subject_id"])} for r in rows
    ]


def save_stream(conn: Connection, data: dict, faculty_id: int | None, stream_id: int | None = None) -> int:
    """POST makes a predefined stream (like FAF). Automatic streams are made from assignments
    (see save_assignment). PUT on either kind may rename it and change its groups."""
    group_ids = sorted({pid(g) for g in data.get("groupIds") or []})
    if len(group_ids) < 2:
        raise ApiError(422, "A stream needs at least 2 groups")
    name = (data.get("name") or "").strip()
    if stream_id is None:
        if not name:
            raise ApiError(422, "A stream needs a name")
        if faculty_id is None:
            raise ApiError(422, "A predefined stream needs a faculty")
        stream_id = conn.execute(
            text("insert into stream (origin, name, faculty_id) values ('predefined', :n, :f) returning id"), {"n": name, "f": faculty_id}
        ).scalar_one()
    else:
        if not conn.execute(text("update stream set name = coalesce(nullif(:n, ''), name) where id = :id"), {"n": name, "id": stream_id}).rowcount:
            raise ApiError(404, "Not found")
    _replace(conn, "stream_group", "stream_id", stream_id, ["group_id"], [(g,) for g in group_ids])
    return stream_id


# ---------------------------------------------------------------- subjects


def load_subjects(conn: Connection, ids: Iterable[int] | None = None) -> list[dict]:
    where, p = _ids_clause("s.id", ids)
    rows = _all(
        conn,
        "select s.id, s.code, s.name, s.credits, s.year, s.semester, s.edge_of_day, f.name as faculty, s.cycle::text as cycle, s.has_midterm1, s.has_midterm2, s.has_exam, "
        f"s.language::text as language, s.lecture_pairs, s.seminar_pairs, s.lab_pairs from subject s left join faculty f on f.id = s.faculty_id{where} order by s.id",
        p,
    )
    tags: dict[int, list[str]] = defaultdict(list)
    if rows:
        for r in _all(conn, "select subject_id, cluster_id from subject_cluster where subject_id = any(cast(:k as bigint[])) order by cluster_id", {"k": [r["id"] for r in rows]}):
            tags[r["subject_id"]].append(sid(r["cluster_id"]))
    out = []
    for r in rows:
        s = {
            "id": sid(r["id"]), "code": r["code"], "name": r["name"], "credits": num(r["credits"]), "year": r["year"], "semester": r["semester"], "edgeOfDay": r["edge_of_day"], "clusterIds": tags[r["id"]],
            "cycle": r["cycle"], "hasMidterm1": r["has_midterm1"], "hasMidterm2": r["has_midterm2"], "hasExam": r["has_exam"],
            "evaluation": "exam" if r["has_exam"] else "atestari", "lecturePairs": num(r["lecture_pairs"]), "seminarPairs": num(r["seminar_pairs"]), "labPairs": num(r["lab_pairs"]),
            "language": r["language"],
        }
        if r["faculty"]:
            s["faculty"] = r["faculty"]
        out.append(s)
    return out


def save_subject(conn: Connection, data: dict, sub_id: int | None = None) -> int:
    # the assessment: all three by default; an older client that only sends "evaluation" still works
    has_exam = data["hasExam"] if data.get("hasExam") is not None else data.get("evaluation") != "atestari"
    params = {
        "sm": data.get("semester") or 1, "m1": data.get("hasMidterm1") is not False, "m2": data.get("hasMidterm2") is not False, "hx": bool(has_exam),
        "code": data["code"].strip().upper(), "name": data["name"], "credits": data["credits"], "year": data["year"],
        "fid": faculty_id_by_name(conn, data.get("faculty")), "cycle": data.get("cycle") or "licenta", "ev": "exam" if has_exam else "atestari",
        "edge": bool(data.get("edgeOfDay")), "lec": data.get("lecturePairs") or 0, "sem": data.get("seminarPairs") or 0, "lab": data.get("labPairs") or 0,
        "lang": data.get("language") or "ro",
    }
    if sub_id is None:
        sub_id = conn.execute(
            text("insert into subject (code, name, credits, year, semester, faculty_id, cycle, evaluation, has_midterm1, has_midterm2, has_exam, edge_of_day, lecture_pairs, seminar_pairs, lab_pairs, language) "
                 "values (:code, :name, :credits, :year, :sm, :fid, cast(:cycle as study_cycle), cast(:ev as evaluation_kind), :m1, :m2, :hx, :edge, :lec, :sem, :lab, cast(:lang as study_language)) returning id"),
            params,
        ).scalar_one()
        _save_tags(conn, sub_id, data.get("clusterIds") or [])
        return sub_id
    n = conn.execute(
        text("update subject set code=:code, name=:name, credits=:credits, year=:year, semester=:sm, faculty_id=:fid, cycle=cast(:cycle as study_cycle), "
             "evaluation=cast(:ev as evaluation_kind), has_midterm1=:m1, has_midterm2=:m2, has_exam=:hx, edge_of_day=:edge, lecture_pairs=:lec, seminar_pairs=:sem, lab_pairs=:lab, "
             "language=cast(:lang as study_language) where id=:id"),
        {**params, "id": sub_id},
    ).rowcount
    if not n:
        raise ApiError(404, "Not found")
    if "clusterIds" in data:  # an update that does not mention the tags leaves them as they are
        _save_tags(conn, sub_id, data["clusterIds"] or [])
    return sub_id


def _save_tags(conn: Connection, subject_id: int, cluster_ids: list) -> None:
    _replace(conn, "subject_cluster", "subject_id", subject_id, ["cluster_id"], [(pid(c),) for c in sorted({str(c) for c in cluster_ids}, key=lambda x: (len(x), x))])


# ---------------------------------------------------------------- clusters


def _speciality(group_name: str) -> str:
    """FAF-261 -> FAF (the same rule as speciality_of() in the database and specOf() in the frontend)."""
    return re.sub(r"-\d+$", "", group_name).upper()


def cluster_name(cycle: str, year: int, speciality: str | None) -> str:
    prefix = "Master · " if cycle == "master" else ""
    return f"{prefix}{speciality} · Year {year}" if speciality else f"{prefix}Year {year}"


def load_clusters(conn: Connection) -> list[dict]:
    """The clusters (made automatically from the groups) with the groups that belong to each."""
    rows = _all(conn, "select id, kind, cycle::text as cycle, year, speciality from cluster", {})
    members: dict[tuple, list[str]] = defaultdict(list)
    for g in _all(conn, "select id, name, cycle::text as cycle, year from student_group order by id", {}):
        members[(g["cycle"], g["year"], None)].append(sid(g["id"]))
        members[(g["cycle"], g["year"], _speciality(g["name"]))].append(sid(g["id"]))
    rows.sort(key=lambda r: (r["cycle"] != "licenta", r["year"], r["speciality"] is not None, r["speciality"] or ""))
    out = []
    for r in rows:
        c = {"id": sid(r["id"]), "kind": r["kind"], "cycle": r["cycle"], "year": r["year"], "name": cluster_name(r["cycle"], r["year"], r["speciality"]),
             "groupIds": members[(r["cycle"], r["year"], r["speciality"])]}
        if r["speciality"]:
            c["speciality"] = r["speciality"]
        out.append(c)
    return out


# ---------------------------------------------------------------- assignments


def load_assignments(conn: Connection, ids: Iterable[int] | None = None) -> list[dict]:
    where, p = _ids_clause("a.id", ids)
    rows = _all(
        conn,
        "select a.id, a.subject_id, a.activity_type::text as type, a.teacher_id, a.audience_kind::text as kind, a.stream_id, a.group_id, a.subgroup_no, "
        f"a.pairs_per_week, a.pairs_per_session, a.parity::text as parity, a.room_type::text as room_type from assignment a{where} order by a.id",
        p,
    )
    if not rows:
        return []
    equip: dict[int, list[str]] = defaultdict(list)
    for r in _all(conn, "select ae.assignment_id, e.name from assignment_equipment ae join equipment e on e.id = ae.equipment_id where ae.assignment_id = any(cast(:k as bigint[])) order by e.name", {"k": [r["id"] for r in rows]}):
        equip[r["assignment_id"]].append(r["name"])
    out = []
    for r in rows:
        if r["kind"] == "stream":
            aud = {"kind": "stream", "id": sid(r["stream_id"])}
        elif r["kind"] == "group":
            aud = {"kind": "group", "id": sid(r["group_id"])}
        else:
            aud = {"kind": "subgroup", "id": sid(r["group_id"]), "subgroup": r["subgroup_no"]}
        a = {
            "id": sid(r["id"]), "subjectId": sid(r["subject_id"]), "type": r["type"], "teacherId": sid(r["teacher_id"]), "audience": aud,
            "pairsPerWeek": num(r["pairs_per_week"]), "parity": r["parity"], "roomType": r["room_type"], "equipment": equip[r["id"]],
        }
        if r["pairs_per_session"] is not None:
            a["pairsPerSession"] = num(r["pairs_per_session"])
        out.append(a)
    return out


def audience_group_ids(conn: Connection, audience: dict) -> list[int]:
    """Database ids of the groups an audience covers (for permission checks)."""
    if audience["kind"] == "stream":
        sidv = maybe_pid(audience.get("id"))
        if sidv is None:
            return [pid(g) for g in audience.get("groupIds") or []]
        return [r[0] for r in conn.execute(text("select group_id from stream_group where stream_id = :s"), {"s": sidv}).all()]
    return [pid(audience["id"])]


def save_assignment(conn: Connection, data: dict, assignment_id: int | None = None) -> int:
    aud = data["audience"]
    kind = aud["kind"]
    subject_id = pid(data["subjectId"])
    stream_id = group_id = subgroup = None
    if kind == "stream":
        if aud.get("id") not in (None, ""):
            stream_id = pid(aud["id"])
        elif aud.get("groupIds"):
            # the stream of this lecture: found by its groups, or created on the spot
            stream_id = conn.execute(
                text("select get_or_create_stream(:s, cast(:g as bigint[]))"), {"s": subject_id, "g": [pid(g) for g in aud["groupIds"]]}
            ).scalar_one()
        else:
            raise ApiError(422, "A stream audience needs an id or groupIds")
    elif kind == "group":
        group_id = pid(aud["id"])
    elif kind == "subgroup":
        group_id, subgroup = pid(aud["id"]), aud.get("subgroup")
    else:
        raise ApiError(422, f"Unknown audience kind: {kind}")
    params = {
        "sub": subject_id, "teacher": pid(data["teacherId"]), "type": data["type"], "kind": kind, "stream": stream_id, "group": group_id, "sg": subgroup,
        "ppw": data["pairsPerWeek"], "pps": data.get("pairsPerSession"), "parity": data.get("parity") or "weekly", "room": data["roomType"],
    }
    if assignment_id is None:
        assignment_id = conn.execute(
            text("insert into assignment (subject_id, teacher_id, activity_type, audience_kind, stream_id, group_id, subgroup_no, pairs_per_week, pairs_per_session, parity, room_type) "
                 "values (:sub, :teacher, cast(:type as activity_type), cast(:kind as audience_kind), :stream, :group, :sg, :ppw, :pps, cast(:parity as parity), cast(:room as room_type)) returning id"),
            params,
        ).scalar_one()
    else:
        n = conn.execute(
            text("update assignment set subject_id=:sub, teacher_id=:teacher, activity_type=cast(:type as activity_type), audience_kind=cast(:kind as audience_kind), "
                 "stream_id=:stream, group_id=:group, subgroup_no=:sg, pairs_per_week=:ppw, pairs_per_session=:pps, parity=cast(:parity as parity), room_type=cast(:room as room_type) where id=:id"),
            {**params, "id": assignment_id},
        ).rowcount
        if not n:
            raise ApiError(404, "Not found")
    _replace(conn, "assignment_equipment", "assignment_id", assignment_id, ["equipment_id"], [(e,) for e in ensure_equipment(conn, data.get("equipment") or [])])
    return assignment_id


LOADERS = {
    "teachers": load_teachers,
    "rooms": load_rooms,
    "groups": load_groups,
    "streams": load_streams,
    "subjects": load_subjects,
    "assignments": load_assignments,
}
