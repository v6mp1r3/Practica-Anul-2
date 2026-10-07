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


def test_exam_generation_is_not_available_yet(client, admin):
    r = client.post("/api/exams/plans/session/generate", headers=admin)
    assert r.status_code == 501


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
