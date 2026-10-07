from .helpers import World, assignment, create, group, room, teacher
from .test_timetables import lesson, save

TUESDAY = "2026-10-06"  # lessons below are on day 1 (Tuesday), pair 3


def published_world(client, admin):
    """g1 has a seminar (t1, room r1) Tuesday pair 3; g2 has one (t2, room r2) at the same time."""
    w = World(client, admin)
    w.r3 = create(client, admin, "rooms", room(name="3-406"))
    w.t3 = create(client, admin, "teachers", teacher(name="Ana Munteanu", email="ana@example.md"))
    w.a1 = w.seminar(w.s1, w.t1, w.g1)
    w.a2 = w.seminar(w.s2, w.t2, w.g2)
    t = save(client, admin, "Orar", [w.g1["id"], w.g2["id"]], [lesson(w.a1["id"], 1, 2, w.r1["id"], "x"), lesson(w.a2["id"], 1, 2, w.r2["id"], "y")])
    assert client.post(f"/api/timetables/{t['id']}/publish", headers=admin).status_code == 200
    return w


def change(w, **kw):
    return {"date": TUESDAY, "assignmentId": w.a1["id"], "slot": 2, "kind": "room", "fromRoomId": w.r1["id"], "roomId": w.r3["id"], **kw}


def test_room_change_is_public_and_notifies_the_people_involved(client, admin):
    w = published_world(client, admin)
    r = client.post("/api/changes", json=change(w, note="Renovare"), headers=admin)
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["roomId"] == w.r3["id"] and c["fromRoomId"] == w.r1["id"] and c["note"] == "Renovare" and c["createdAt"].endswith("Z") and "teacherId" not in c
    assert client.get("/api/changes").json() == [c]  # no token needed
    n = client.get("/api/notifications", headers=admin).json()[0]
    assert n["kind"] == "room-change" and n["groupIds"] == [w.g1["id"]] and n["teacherIds"] == [w.t1["id"]]
    assert n["params"] == {"assignmentId": w.a1["id"], "date": TUESDAY, "slot": 2, "fromRoomId": w.r1["id"], "roomId": w.r3["id"], "note": "Renovare"}
    assert client.delete(f"/api/changes/{c['id']}", headers=admin).status_code == 204
    assert client.delete(f"/api/changes/{c['id']}", headers=admin).status_code == 404
    assert client.get("/api/changes").json() == []


def test_a_busy_room_or_teacher_is_refused(client, admin):
    w = published_world(client, admin)
    # room r2 is used by the other seminar at that time
    assert client.post("/api/changes", json=change(w, roomId=w.r2["id"]), headers=admin).status_code == 422
    # a room that is too small for the group is refused as well
    tiny = create(client, admin, "rooms", room(name="tiny", capacity=5))
    assert client.post("/api/changes", json=change(w, roomId=tiny["id"]), headers=admin).status_code == 422
    # once a pair has moved into r3 a second one cannot take it the same day
    assert client.post("/api/changes", json=change(w), headers=admin).status_code == 201
    other = change(w, assignmentId=w.a2["id"], fromRoomId=w.r2["id"])
    assert client.post("/api/changes", json=other, headers=admin).status_code == 422
    # teacher: t2 teaches at that time, t3 is free; the teacher themselves cannot substitute
    teach = {"date": TUESDAY, "assignmentId": w.a1["id"], "slot": 2, "kind": "teacher", "fromRoomId": w.r1["id"]}
    assert client.post("/api/changes", json={**teach, "teacherId": w.t2["id"]}, headers=admin).status_code == 422
    assert client.post("/api/changes", json={**teach, "teacherId": w.t1["id"]}, headers=admin).status_code == 422
    r = client.post("/api/changes", json={**teach, "teacherId": w.t3["id"]}, headers=admin)
    assert r.status_code == 201 and r.json()["teacherId"] == w.t3["id"]
    n = client.get("/api/notifications", headers=admin).json()[0]
    assert n["kind"] == "teacher-change" and n["teacherIds"] == sorted([w.t1["id"], w.t3["id"]])
    # the same change twice
    assert client.post("/api/changes", json={**teach, "teacherId": w.t3["id"]}, headers=admin).status_code == 422


def test_changes_need_a_pair_that_really_takes_place(client, admin):
    w = published_world(client, admin)
    assert client.post("/api/changes", json=change(w, date="2026-10-07"), headers=admin).status_code == 422  # Wednesday
    assert client.post("/api/changes", json=change(w, slot=3), headers=admin).status_code == 422
    assert client.post("/api/changes", json=change(w, fromRoomId=w.r2["id"]), headers=admin).status_code == 422
    assert client.post("/api/changes", json=change(w, date="not a date"), headers=admin).status_code == 422
    assert client.post("/api/changes", json=change(w, kind="swap"), headers=admin).status_code == 422
    assert client.post("/api/changes", json=change(w, roomId=None), headers=admin).status_code == 422
    assert client.post("/api/changes", json=change(w)).status_code == 401


def test_no_changes_without_a_published_timetable(client, admin):
    w = World(client, admin)
    a = w.seminar(w.s1, w.t1, w.g1)
    r = client.post("/api/changes", json={"date": TUESDAY, "assignmentId": a["id"], "slot": 2, "kind": "room", "fromRoomId": w.r1["id"], "roomId": w.r2["id"]}, headers=admin)
    assert r.status_code == 422 and "published" in r.json()["message"]


def test_odd_even_weeks(client, admin):
    w = World(client, admin)
    a = create(client, admin, "assignments", assignment(w.s1["id"], w.t1["id"], {"kind": "group", "id": w.g1["id"]}, type="seminar", roomType="seminar", parity="odd"))
    t = save(client, admin, "Orar", [w.g1["id"]], [lesson(a["id"], 1, 2, w.r1["id"], "x", parity="odd")])
    client.post(f"/api/timetables/{t['id']}/publish", headers=admin)
    body = {"assignmentId": a["id"], "slot": 2, "kind": "room", "fromRoomId": w.r1["id"], "roomId": w.r2["id"]}
    # 2026-10-06 is week 6 from 1 September: even, so the odd-week pair is not held; 2026-10-13 is odd
    assert client.post("/api/changes", json={**body, "date": "2026-10-06"}, headers=admin).status_code == 422
    assert client.post("/api/changes", json={**body, "date": "2026-10-13"}, headers=admin).status_code == 201


def test_notifications_list_and_mark_read(client, admin):
    w = published_world(client, admin)
    client.post("/api/changes", json=change(w), headers=admin)
    listing = client.get("/api/notifications", headers=admin).json()
    assert [n["kind"] for n in listing] == ["room-change", "published"] and not any(n["read"] for n in listing)
    assert listing[1]["title"] == "" and listing[1]["roles"] == [] and "groupIds" not in listing[1]
    assert client.post("/api/notifications/read", json={"ids": [listing[0]["id"], "bogus", "999"]}, headers=admin).status_code == 204
    assert [n["read"] for n in client.get("/api/notifications", headers=admin).json()] == [True, False]
    client.post("/api/notifications/read", json={"ids": [listing[0]["id"]]}, headers=admin)  # again: no error
    assert client.get("/api/notifications").status_code == 401


def test_read_state_is_per_user(client, admin, other_admin):
    published_world(client, admin)
    first = client.get("/api/notifications", headers=admin).json()[0]["id"]
    client.post("/api/notifications/read", json={"ids": [first]}, headers=admin)
    assert client.get("/api/notifications", headers=other_admin).json()[0]["read"] is False


def test_generation_is_not_available_yet(client, admin):
    w = World(client, admin)
    r = client.post("/api/generate", json={"groupIds": [w.g1["id"]], "variants": 3, "iterations": 250}, headers=admin)
    assert r.status_code == 501 and "solver" in r.json()["message"]
    assert client.post("/api/generate", json={"groupIds": []}).status_code == 401
    assert client.get("/api/generate/job_1", headers=admin).status_code == 404
