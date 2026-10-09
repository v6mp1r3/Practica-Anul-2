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
        "select s.id, s.code, s.name, s.abbreviation, s.credits, s.year, s.semester, s.edge_of_day, f.name as faculty, s.cycle::text as cycle, s.has_midterm1, s.has_midterm2, s.has_exam, "
        f"s.lecture_pairs, s.seminar_pairs, s.lab_pairs from subject s left join faculty f on f.id = s.faculty_id{where} order by s.id",
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
        }
        if r["faculty"]:
            s["faculty"] = r["faculty"]
        if r["abbreviation"]:
            s["abbreviation"] = r["abbreviation"]
        out.append(s)
    return out


def save_subject(conn: Connection, data: dict, sub_id: int | None = None) -> int:
    # the assessment: all three by default; an older client that only sends "evaluation" still works
    has_exam = data["hasExam"] if data.get("hasExam") is not None else data.get("evaluation") != "atestari"
    params = {
        "sm": data.get("semester") or 1, "m1": data.get("hasMidterm1") is not False, "m2": data.get("hasMidterm2") is not False, "hx": bool(has_exam),
        "code": data["code"].strip().upper(), "name": data["name"], "abbr": (data.get("abbreviation") or "").strip() or None, "credits": data["credits"], "year": data["year"],
        "fid": faculty_id_by_name(conn, data.get("faculty")), "cycle": data.get("cycle") or "licenta", "ev": "exam" if has_exam else "atestari",
        "edge": bool(data.get("edgeOfDay")), "lec": data.get("lecturePairs") or 0, "sem": data.get("seminarPairs") or 0, "lab": data.get("labPairs") or 0,
    }
    if sub_id is None:
        sub_id = conn.execute(
            text("insert into subject (code, name, abbreviation, credits, year, semester, faculty_id, cycle, evaluation, has_midterm1, has_midterm2, has_exam, edge_of_day, lecture_pairs, seminar_pairs, lab_pairs) "
                 "values (:code, :name, :abbr, :credits, :year, :sm, :fid, cast(:cycle as study_cycle), cast(:ev as evaluation_kind), :m1, :m2, :hx, :edge, :lec, :sem, :lab) returning id"),
            params,
        ).scalar_one()
        _save_tags(conn, sub_id, data.get("clusterIds") or [])
        return sub_id
    n = conn.execute(
        text("update subject set code=:code, name=:name, abbreviation=:abbr, credits=:credits, year=:year, semester=:sm, faculty_id=:fid, cycle=cast(:cycle as study_cycle), "
             "evaluation=cast(:ev as evaluation_kind), has_midterm1=:m1, has_midterm2=:m2, has_exam=:hx, edge_of_day=:edge, lecture_pairs=:lec, seminar_pairs=:sem, lab_pairs=:lab where id=:id"),
        {**params, "id": sub_id},
    ).rowcount
    if not n:
        raise ApiError(404, "Not found")
    if "clusterIds" in data:  # an update that does not mention the tags leaves them as they are
        _save_tags(conn, sub_id, data["clusterIds"] or [])
    return sub_id


def collapse_tags(cluster_ids: set[str], clusters: list[dict]) -> set[str]:
    """A subject tagged with every speciality of a year (the ones that have groups) is for the whole year: those tags
    become the year's ("Year 1")."""
    out = set(cluster_ids)
    years = {(c["cycle"], c["year"]): c["id"] for c in clusters if c["kind"] == "year"}
    specs: dict[tuple, set[str]] = defaultdict(set)
    for c in clusters:
        if c["kind"] == "speciality" and c["groupIds"]:
            specs[(c["cycle"], c["year"])].add(c["id"])
    for key, ids in specs.items():
        if key in years and ids <= out:
            out = (out - ids) | {years[key]}
    return out


def _save_tags(conn: Connection, subject_id: int, cluster_ids: list) -> None:
    tags = collapse_tags({str(c) for c in cluster_ids}, load_clusters(conn))
    _replace(conn, "subject_cluster", "subject_id", subject_id, ["cluster_id"], [(pid(c),) for c in sorted(tags, key=lambda x: (len(x), x))])


# ---------------------------------------------------------------- clusters


def _speciality(group_name: str) -> str:
    """FAF-261 -> FAF (the same rule as speciality_of() in the database and specOf() in the frontend)."""
    return re.sub(r"-\d+$", "", group_name).upper()


FORM_NAMES = {"full": "Full-time", "reduced": "Reduced attendance", "dual": "Dual"}


def cluster_name(r: dict) -> str:
    if r["kind"] == "language":
        return f"Language · {r['language'].upper()}"
    if r["kind"] == "form":
        return FORM_NAMES.get(r["study_form"], r["study_form"])
    if r["kind"] == "custom":
        return r["name"]
    prefix = "Master · " if r["cycle"] == "master" else ""
    return f"{prefix}{r['speciality']} · Year {r['year']}" if r["speciality"] else f"{prefix}Year {r['year']}"


def load_clusters(conn: Connection) -> list[dict]:
    """The clusters with the groups that belong to each: made automatically from the groups (year, speciality,
    language, form of study) or by an administrator (custom)."""
    rows = _all(conn, "select id, kind, cycle::text as cycle, year, speciality, language::text as language, study_form::text as study_form, name from cluster", {})
    members: dict[tuple, list[str]] = defaultdict(list)
    for g in _all(conn, "select id, name, cycle::text as cycle, year, language::text as language, study_form::text as study_form from student_group order by id", {}):
        for key in (("year", g["cycle"], g["year"], None), ("speciality", g["cycle"], g["year"], _speciality(g["name"])),
                    ("language", g["language"]), ("form", g["study_form"])):
            members[key].append(sid(g["id"]))
    custom: dict[int, list[str]] = defaultdict(list)
    for m in _all(conn, "select cluster_id, group_id from cluster_group order by group_id", {}):
        custom[m["cluster_id"]].append(sid(m["group_id"]))
    order = {"year": 0, "speciality": 0, "language": 1, "form": 2, "custom": 3}
    rows.sort(key=lambda r: (order[r["kind"]], r["cycle"] != "licenta", r["year"] or 0, r["speciality"] is not None, r["speciality"] or "",
                             (["ro", "ru", "en", "fr"] + [r["language"]]).index(r["language"]) if r["language"] else 0,
                             (["full", "reduced", "dual"] + [r["study_form"]]).index(r["study_form"]) if r["study_form"] else 0, (r["name"] or "").lower()))
    out = []
    for r in rows:
        k = r["kind"]
        ids = custom[r["id"]] if k == "custom" else members[
            ("language", r["language"]) if k == "language" else ("form", r["study_form"]) if k == "form" else (k, r["cycle"], r["year"], r["speciality"])]
        c = {"id": sid(r["id"]), "kind": k, "name": cluster_name(r), "groupIds": ids}
        for key, field in (("cycle", "cycle"), ("year", "year"), ("speciality", "speciality"), ("language", "language"), ("studyForm", "study_form")):
            if r[field] is not None:
                c[key] = r[field]
        out.append(c)
    return out


def save_custom_cluster(conn: Connection, data: dict, cluster_id: int | None = None) -> int:
    """A cluster made by an administrator: a name and the groups in it. The other clusters follow the groups."""
    name = (data.get("name") or "").strip()
    if not name:
        raise ApiError(422, "A cluster needs a name")
    group_ids = sorted({pid(g) for g in data.get("groupIds") or []})
    if group_ids and conn.execute(text("select count(*) from student_group where id = any(cast(:g as bigint[]))"), {"g": group_ids}).scalar_one() != len(group_ids):
        raise ApiError(422, "Unknown group")
    clash = conn.execute(text("select id from cluster where kind = 'custom' and lower(trim(name)) = lower(:n) and id is distinct from :id"), {"n": name, "id": cluster_id}).first()
    if clash:
        raise ApiError(409, "A cluster with this name already exists")
    new = cluster_id is None
    if new:
        cluster_id = conn.execute(text("insert into cluster (kind, name) values ('custom', :n) returning id"), {"n": name}).scalar_one()
    else:
        if not conn.execute(text("update cluster set name = :n where id = :id and kind = 'custom'"), {"n": name, "id": cluster_id}).rowcount:
            raise _not_custom(conn, cluster_id)
    if new or "groupIds" in data:  # an update that does not mention the groups leaves them as they are
        _replace(conn, "cluster_group", "cluster_id", cluster_id, ["group_id"], [(g,) for g in group_ids])
    return cluster_id


def delete_custom_cluster(conn: Connection, cluster_id: int) -> None:
    if not conn.execute(text("delete from cluster where id = :id and kind = 'custom'"), {"id": cluster_id}).rowcount:
        raise _not_custom(conn, cluster_id)


def _not_custom(conn: Connection, cluster_id: int) -> ApiError:
    if conn.execute(text("select 1 from cluster where id = :id"), {"id": cluster_id}).first():
        return ApiError(400, "Only custom clusters can be changed; the others follow the groups")
    return ApiError(404, "Not found")


# ---------------------------------------------------------------- assignments


def load_assignments(conn: Connection, ids: Iterable[int] | None = None) -> list[dict]:
    where, p = _ids_clause("a.id", ids)
    rows = _all(
        conn,
        "select a.id, a.subject_id, a.activity_type::text as type, a.teacher_id, a.audience_kind::text as kind, a.stream_id, a.group_id, a.subgroup_no, "
        f"a.pairs_per_week, a.pairs_per_session, a.room_type::text as room_type from assignment a{where} order by a.id",
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
            "pairsPerWeek": num(r["pairs_per_week"]), "roomType": r["room_type"], "equipment": equip[r["id"]],
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


def groups_allowed_by_tags(conn: Connection, subject_id: int) -> set[int] | None:
    """The groups a subject can be given to, from its tags (a subject tagged "Year 1" is not for a group of year 2);
    None when it has no tags. Tags of one kind add up, tags of different kinds all have to fit."""
    tagged = {pid(r[0]) for r in conn.execute(text("select cluster_id from subject_cluster where subject_id = :s"), {"s": subject_id}).all()}
    if not tagged:
        return None
    by_kind: dict[str, set[int]] = defaultdict(set)
    for c in load_clusters(conn):
        if pid(c["id"]) in tagged:
            by_kind[c["kind"]] |= {pid(g) for g in c["groupIds"]}
    allowed: set[int] | None = None
    for ids in by_kind.values():
        allowed = ids if allowed is None else allowed & ids
    return allowed


def save_assignment(conn: Connection, data: dict, assignment_id: int | None = None) -> int:
    aud = data["audience"]
    kind = aud["kind"]
    subject_id = pid(data["subjectId"])
    if kind in ("stream", "group", "subgroup"):
        allowed = groups_allowed_by_tags(conn, subject_id)
        if allowed is not None and not set(audience_group_ids(conn, aud)) <= allowed:
            raise ApiError(422, "This subject is not taught to that group (see its cluster tags)")
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
        "ppw": data["pairsPerWeek"], "pps": data.get("pairsPerSession"), "room": data["roomType"],
    }
    if assignment_id is None:
        assignment_id = conn.execute(
            text("insert into assignment (subject_id, teacher_id, activity_type, audience_kind, stream_id, group_id, subgroup_no, pairs_per_week, pairs_per_session, room_type) "
                 "values (:sub, :teacher, cast(:type as activity_type), cast(:kind as audience_kind), :stream, :group, :sg, :ppw, :pps, cast(:room as room_type)) returning id"),
            params,
        ).scalar_one()
    else:
        n = conn.execute(
            text("update assignment set subject_id=:sub, teacher_id=:teacher, activity_type=cast(:type as activity_type), audience_kind=cast(:kind as audience_kind), "
                 "stream_id=:stream, group_id=:group, subgroup_no=:sg, pairs_per_week=:ppw, pairs_per_session=:pps, room_type=cast(:room as room_type) where id=:id"),
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
