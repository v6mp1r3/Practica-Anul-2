from .helpers import World
from .test_timetables import lesson, save


def event(w, **kw):
    return {"id": "E1", "kind": "exam", "round": "session", "subjectId": w.s1["id"], "groupId": w.g1["id"], "teacherId": w.t1["id"], "roomId": w.r1["id"],
            "date": "2026-12-15", "start": "10:00", "end": "12:15", **kw}


def plan(w, *events, status="draft"):
    return {"faculty": "x", "round": "session", "status": status, "events": list(events), "updatedAt": ""}


def test_no_plan_yet(client, admin):
    assert client.get("/api/exams/plans/session", headers=admin).json() is None
    assert client.get("/api/exams/plans", headers=admin).json() == []
    assert client.get("/api/exams").json() == []


def test_save_publish_unpublish_delete(client, admin, other_admin):
    w = World(client, admin)
    cons = event(w, id="E2", kind="consultation", date="2026-12-14", start="14:00", end="15:30", subgroup=1)
    r = client.put("/api/exams/plans/session", json=plan(w, event(w), cons), headers=admin)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["round"] == "session" and p["status"] == "draft" and p["faculty"].startswith("Facultatea Calculatoare") and p["updatedAt"].endswith("Z")
    # events come back ordered by date and time, with the round filled in
    assert [(e["kind"], e["date"], e["start"], e["end"]) for e in p["events"]] == [("consultation", "2026-12-14", "14:00", "15:30"), ("exam", "2026-12-15", "10:00", "12:15")]
    assert p["events"][0]["subgroup"] == 1 and all(e["round"] == "session" for e in p["events"])
    assert client.get("/api/exams/plans/session", headers=admin).json() == p
    assert client.get("/api/exams/plans", headers=admin).json() == [p]
    assert client.get("/api/exams").json() == []  # drafts are not public
    # the other faculty sees none of it
    assert client.get("/api/exams/plans/session", headers=other_admin).json() is None
    pub = client.post("/api/exams/plans/session/publish", headers=admin).json()
    assert pub["status"] == "published"
    public = client.get("/api/exams").json()  # no token
    assert [e["id"] for e in public] == [e["id"] for e in p["events"]]
    # saving again keeps the status, and replaces the events
    again = client.put("/api/exams/plans/session", json=plan(w, event(w, date="2026-12-16")), headers=admin).json()
    assert again["status"] == "published" and [e["date"] for e in again["events"]] == ["2026-12-16"]
    assert client.post("/api/exams/plans/session/unpublish", headers=admin).json()["status"] == "draft"
    assert client.get("/api/exams").json() == []
    assert client.delete("/api/exams/plans/session", headers=admin).status_code == 204
    assert client.get("/api/exams/plans/session", headers=admin).json() is None
    assert client.post("/api/exams/plans/session/publish", headers=admin).status_code == 404


def test_published_plans_of_every_faculty_are_public(client, admin, other_admin):
    w = World(client, admin)
    client.put("/api/exams/plans/session", json=plan(w, event(w)), headers=admin)
    client.put("/api/exams/plans/session", json=plan(w, event(w, id="F1", date="2026-12-18")), headers=other_admin)
    client.post("/api/exams/plans/session/publish", headers=admin)
    client.post("/api/exams/plans/session/publish", headers=other_admin)
    assert sorted(e["date"] for e in client.get("/api/exams").json()) == ["2026-12-15", "2026-12-18"]
    assert len(client.get("/api/exams/plans", headers=admin).json()) == 1


def test_event_can_point_at_a_lesson_of_a_timetable(client, admin):
    w = World(client, admin)
    a = w.seminar(w.s1, w.t1, w.g1)
    t = save(client, admin, "T", [w.g1["id"]], [lesson(a["id"], 1, 1, w.r1["id"])])
    lid = t["lessons"][0]["id"]
    p = client.put("/api/exams/plans/midterm1", json={**plan(w, event(w, round="midterm1", lessonId=lid, id="m1")), "round": "midterm1"}, headers=admin).json()
    assert p["events"][0]["lessonId"] == lid and p["events"][0]["round"] == "midterm1"
    # a lesson that no longer exists is simply dropped from the event
    p = client.put("/api/exams/plans/midterm1", json={**plan(w, event(w, lessonId="L77")), "round": "midterm1"}, headers=admin).json()
    assert "lessonId" not in p["events"][0]
    # events survive a republish of the timetable that keeps the lesson
    client.put("/api/exams/plans/midterm1", json={**plan(w, event(w, lessonId=lid)), "round": "midterm1"}, headers=admin)
    save(client, admin, "T", [w.g1["id"]], [{**t["lessons"][0], "slot": 3}], tid=t["id"])
    assert client.get("/api/exams/plans/midterm1", headers=admin).json()["events"][0]["lessonId"] == lid


def test_bad_exam_requests(client, admin):
    w = World(client, admin)
    assert client.get("/api/exams/plans/finals", headers=admin).status_code == 422  # not a round
    assert client.put("/api/exams/plans/session", json=plan(w, event(w, end="09:00")), headers=admin).status_code == 422  # ends before it starts
    assert client.put("/api/exams/plans/session", json=plan(w, event(w, roomId="999")), headers=admin).status_code == 422  # unknown room
    assert client.put("/api/exams/plans/session", json=plan(w, event(w, date="31 Dec")), headers=admin).status_code == 422
    assert client.get("/api/exams/plans/session", headers=admin).json() is None  # nothing half-saved
    assert client.get("/api/exams/plans").status_code == 401


def test_things_still_in_use_cannot_be_deleted(client, admin):
    w = World(client, admin)
    a = w.seminar(w.s1, w.t1, w.g1)
    t = save(client, admin, "T", [w.g1["id"]], [lesson(a["id"], 1, 1, w.r1["id"])])
    r = client.delete(f"/api/rooms/{w.r1['id']}", headers=admin)  # a timetable puts a lesson in it
    assert r.status_code == 409 and "still use" in r.json()["message"]
    client.put("/api/exams/plans/session", json=plan(w, event(w, roomId=w.r2["id"])), headers=admin)
    assert client.delete(f"/api/rooms/{w.r2['id']}", headers=admin).status_code == 409  # an exam is held in it
    assert client.delete(f"/api/subjects/{w.s1['id']}", headers=admin).status_code == 409  # so is its exam
    client.delete(f"/api/exams/plans/session", headers=admin)
    assert client.delete(f"/api/subjects/{w.s1['id']}", headers=admin).status_code == 204
    assert client.delete(f"/api/timetables/{t['id']}", headers=admin).status_code == 204
    assert client.delete(f"/api/rooms/{w.r1['id']}", headers=admin).status_code == 204


# ---------------------------------------------------------------- generation


def exam_world(client, admin):
    """Two groups; AM and PC end with an exam, SPORT only with atestari."""
    from .helpers import assignment, create, subject

    w = World(client, admin)
    w.s3 = create(client, admin, "subjects", subject("SPORT", evaluation="atestari"))
    for g in (w.g1, w.g2):
        create(client, admin, "assignments", assignment(w.s1["id"], w.t1["id"], {"kind": "group", "id": g["id"]}))
        create(client, admin, "assignments", assignment(w.s2["id"], w.t2["id"], {"kind": "group", "id": g["id"]}))
        create(client, admin, "assignments", assignment(w.s3["id"], w.t1["id"], {"kind": "group", "id": g["id"]}, type="seminar", roomType="seminar"))
    return w


def minutes(t):
    return int(t[:2]) * 60 + int(t[3:])


def clashes(events):
    for i, a in enumerate(events):
        for b in events[i + 1:]:
            if a["date"] == b["date"] and minutes(a["start"]) < minutes(b["end"]) and minutes(b["start"]) < minutes(a["end"]):
                if a["teacherId"] == b["teacherId"] or a["roomId"] == b["roomId"] or a["groupId"] == b["groupId"]:
                    return (a, b)
    return None


def test_generate_the_exam_session(client, admin):
    w = exam_world(client, admin)
    r = client.post("/api/exams/plans/session/generate", json={"seed": 5}, headers=admin)
    assert r.status_code == 200, r.text
    plan = r.json()
    assert plan["round"] == "session" and plan["status"] == "draft" and plan["warnings"] == 0
    exams = [e for e in plan["events"] if e["kind"] == "exam"]
    consultations = [e for e in plan["events"] if e["kind"] == "consultation"]
    # every group sits an exam in AM and PC, and has a consultation for each; the atestari-only subject has none
    assert sorted((e["groupId"], e["subjectId"]) for e in exams) == sorted((g["id"], s["id"]) for g in (w.g1, w.g2) for s in (w.s1, w.s2))
    assert len(consultations) == 4 and all(e["round"] == "session" for e in plan["events"])
    assert clashes(plan["events"]) is None
    for g in (w.g1, w.g2):
        dates = sorted(e["date"] for e in exams if e["groupId"] == g["id"])
        assert dates[0] != dates[1]  # one exam a day, with free days between
    for c in consultations:
        e = next(x for x in exams if x["groupId"] == c["groupId"] and x["subjectId"] == c["subjectId"])
        assert (c["date"], c["start"]) < (e["date"], e["start"]) and c["teacherId"] == e["teacherId"]
    # it is a normal plan: stored, readable, publishable
    assert client.get("/api/exams/plans/session", headers=admin).json()["events"] == plan["events"]
    assert client.post("/api/exams/plans/session/publish", headers=admin).json()["status"] == "published"


def test_generation_is_repeatable_and_replaces_the_plan(client, admin):
    exam_world(client, admin)
    first = client.post("/api/exams/plans/session/generate", json={"seed": 9}, headers=admin).json()
    client.post("/api/exams/plans/session/publish", headers=admin)
    again = client.post("/api/exams/plans/session/generate", json={"seed": 9}, headers=admin).json()
    strip = lambda p: [{k: v for k, v in e.items() if k != "id"} for e in p["events"]]
    assert strip(again) == strip(first)  # the same seed gives the same plan
    assert again["status"] == "draft"  # generating again withdraws it
    other = client.post("/api/exams/plans/session/generate", json={"seed": 10}, headers=admin).json()
    assert len(other["events"]) == len(first["events"]) and len(client.get("/api/exams/plans", headers=admin).json()) == 1


def test_published_exams_of_other_faculties_stay_booked(client, admin, other_admin):
    w = exam_world(client, admin)
    # FET publishes an exam that books teacher t1 and room r1 on every day and hour the session could use
    blocking = []
    for day in range(14, 27):
        for start, end in (("08:00", "10:15"), ("10:00", "12:15"), ("12:00", "14:15"), ("14:00", "16:15"), ("16:00", "18:15")):
            blocking.append(event(w, id=f"X{day}{start}", date=f"2026-12-{day:02d}", start=start, end=end))
    for day in range(11, 24):
        for start, end in (("08:00", "10:15"), ("10:00", "12:15"), ("12:00", "14:15"), ("14:00", "16:15"), ("16:00", "18:15")):
            blocking.append(event(w, id=f"Y{day}{start}", date=f"2027-01-{day:02d}", start=start, end=end))
    client.put("/api/exams/plans/session", json=plan(w, *blocking), headers=other_admin)
    client.post("/api/exams/plans/session/publish", headers=other_admin)
    r = client.post("/api/exams/plans/session/generate", json={"seed": 1}, headers=admin).json()
    # t1 (AM's and SPORT's teacher) is busy all session, so AM cannot be placed anywhere; PC (t2) can
    assert r["warnings"] >= 2
    assert {e["subjectId"] for e in r["events"] if e["kind"] == "exam"} == {w.s2["id"]}
    assert all(clashes([g, b]) is None for g in r["events"] for b in blocking)  # nothing generated meets a booked event


def test_other_rounds_of_the_same_faculty_stay_booked(client, admin):
    exam_world(client, admin)
    a = client.post("/api/exams/plans/session/generate", json={"seed": 3}, headers=admin).json()
    b = client.post("/api/exams/plans/reexam/generate", json={"seed": 3}, headers=admin).json()
    assert b["round"] == "reexam" and clashes(a["events"] + b["events"]) is None


def published_timetable(client, admin, w):
    from .test_timetables import lesson, save

    loads = {(a["subjectId"], a["type"], a["audience"]["id"]): a for a in client.get("/api/assignments", headers=admin).json()}
    lessons = []
    for i, g in enumerate((w.g1, w.g2)):
        lessons.append(lesson(loads[(w.s1["id"], "lecture", g["id"])]["id"], 0 + i, 1, w.r1["id"] if i == 0 else w.r2["id"], f"a{i}"))
        lessons.append(lesson(loads[(w.s2["id"], "lecture", g["id"])]["id"], 1 + i, 2, w.r1["id"] if i == 0 else w.r2["id"], f"b{i}"))
        lessons.append(lesson(loads[(w.s3["id"], "seminar", g["id"])]["id"], 2 + i, 3, w.r1["id"] if i == 0 else w.r2["id"], f"c{i}"))
    t = save(client, admin, "Orar", [w.g1["id"], w.g2["id"]], lessons)
    client.post(f"/api/timetables/{t['id']}/publish", headers=admin)
    return client.get("/api/timetables/published").json()


def test_atestari_are_held_in_the_subjects_own_classes(client, admin):
    w = exam_world(client, admin)
    pub = published_timetable(client, admin, w)
    lesson_ids = {l["id"] for l in pub["lessons"]}
    for n in (1, 2):
        r = client.post(f"/api/exams/plans/midterm{n}/generate", json={"seed": 2}, headers=admin)
        assert r.status_code == 200, r.text
        plan_ = r.json()
        assert plan_["round"] == f"midterm{n}" and plan_["warnings"] == 0
        # one atestare for each subject of each group (SPORT too: atestari are for every subject), in one of its own classes
        assert len(plan_["events"]) == 6 and all(e["lessonId"] in lesson_ids and e["kind"] == "exam" for e in plan_["events"])
        for e in plan_["events"]:
            l = next(x for x in pub["lessons"] if x["id"] == e["lessonId"])
            assert e["roomId"] == l["roomId"]


def test_atestare_retakes_are_held_after_classes(client, admin):
    w = exam_world(client, admin)
    published_timetable(client, admin, w)
    r = client.post("/api/exams/plans/remidterm1/generate", json={"seed": 4}, headers=admin).json()
    assert r["round"] == "remidterm1" and r["events"]
    assert all("lessonId" not in e and e["round"] == "remidterm1" for e in r["events"])
    assert clashes(r["events"]) is None


def test_generation_needs_an_administrator_and_a_real_round(client, admin):
    assert client.post("/api/exams/plans/session/generate").status_code == 401
    assert client.post("/api/exams/plans/finals/generate", headers=admin).status_code == 422
    # nothing to examine: an empty plan, not an error
    r = client.post("/api/exams/plans/session/generate", headers=admin)
    assert r.status_code == 200 and r.json()["events"] == [] and r.json()["warnings"] == 0


def test_a_project_only_subject_still_gets_its_atestari(client, admin):
    """Projects rank last when choosing the class an atestare is held in, but a project-only subject has one."""
    from .helpers import assignment, create, subject

    w = World(client, admin)
    proj = create(client, admin, "subjects", subject("PCAS", labPairs=0))
    a = create(client, admin, "assignments", assignment(proj["id"], w.t1["id"], {"kind": "group", "id": w.g1["id"]}, type="project", roomType="seminar"))
    from .test_timetables import lesson, save

    t = save(client, admin, "T", [w.g1["id"]], [lesson(a["id"], 1, 2, w.r1["id"])])
    client.post(f"/api/timetables/{t['id']}/publish", headers=admin)
    r = client.post("/api/exams/plans/midterm1/generate", json={"seed": 1}, headers=admin).json()
    assert r["warnings"] == 0 and [e["subjectId"] for e in r["events"]] == [proj["id"]]
    assert r["events"][0]["lessonId"] == client.get("/api/timetables/published").json()["lessons"][0]["id"]
