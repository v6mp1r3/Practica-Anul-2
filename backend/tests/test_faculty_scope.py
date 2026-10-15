"""An administrator changes only their own faculty's part: timetables, streams, clusters, schedule
changes and exam plans of another faculty's groups are refused (403)."""
from .helpers import World, assignment, create, group, teacher
from .test_timetables import lesson, save, two_faculties


def test_another_facultys_draft_cant_be_changed_deleted_or_published(client, admin, other_admin):
    w, h1, r3, a1, b1 = two_faculties(client, admin, other_admin)
    ta = save(client, admin, "FCIM", [w.g1["id"]], [lesson(a1["id"], 1, 1, w.r1["id"])])
    body = {"name": "x", "status": "draft", "algorithm": "", "groupIds": [w.g1["id"]], "lessons": []}
    assert client.put(f"/api/timetables/{ta['id']}", json=body, headers=other_admin).status_code == 403
    assert client.delete(f"/api/timetables/{ta['id']}", headers=other_admin).status_code == 403
    assert client.post(f"/api/timetables/{ta['id']}/publish", headers=other_admin).status_code == 403
    # nor a new draft with another faculty's groups in it
    body = {"name": "mine", "status": "draft", "algorithm": "", "groupIds": [w.g1["id"], h1["id"]], "lessons": []}
    assert client.put("/api/timetables/new", json=body, headers=other_admin).status_code == 403
    assert client.get(f"/api/timetables/{ta['id']}", headers=admin).json()["name"] == "FCIM"  # untouched


def test_the_published_timetable_changes_only_in_ones_own_pairs(client, admin, other_admin):
    w, h1, r3, a1, b1 = two_faculties(client, admin, other_admin)
    ta = save(client, admin, "FCIM", [w.g1["id"]], [lesson(a1["id"], 1, 1, w.r1["id"])])
    tb = save(client, other_admin, "FET", [h1["id"]], [lesson(b1["id"], 2, 1, w.r2["id"], lid="M")])
    client.post(f"/api/timetables/{ta['id']}/publish", headers=admin)
    client.post(f"/api/timetables/{tb['id']}/publish", headers=other_admin)
    pub = client.get("/api/timetables/published").json()
    fcim = next(l for l in pub["lessons"] if l["assignmentId"] == a1["id"])
    fet = next(l for l in pub["lessons"] if l["assignmentId"] == b1["id"])
    body = lambda lessons: {"name": pub["name"], "status": "published", "algorithm": "", "groupIds": pub["groupIds"], "lessons": lessons}
    # FET moves FCIM's pair: refused; FET moves its own: fine
    assert client.put(f"/api/timetables/{pub['id']}", json=body([{**fcim, "day": 4}, fet]), headers=other_admin).status_code == 403
    r = client.put(f"/api/timetables/{pub['id']}", json=body([fcim, {**fet, "day": 4}]), headers=other_admin)
    assert r.status_code == 200, r.text
    # FET can't drop FCIM's groups either
    assert client.put(f"/api/timetables/{pub['id']}", json={**body([fcim, fet]), "groupIds": [h1["id"]]}, headers=other_admin).status_code == 403
    # the published one is withdrawn, not deleted
    r = client.delete(f"/api/timetables/{pub['id']}", headers=admin)
    assert r.status_code == 409 and "unpublish" in r.json()["message"]


def test_a_teacher_reads_only_the_published_timetable(client, admin):
    w = World(client, admin)
    a = w.seminar(w.s1, w.t1, w.g1)
    t = save(client, admin, "draft", [w.g1["id"]], [lesson(a["id"], 1, 1, w.r1["id"])])
    client.post("/api/users", json={"username": "daniel", "role": "teacher", "teacherId": w.t1["id"], "password": "teacher-pass-1"}, headers=admin)
    token = client.post("/api/auth/login", json={"username": "daniel", "password": "teacher-pass-1"}).json()["token"]
    me = {"Authorization": f"Bearer {token}"}
    assert client.get(f"/api/timetables/{t['id']}", headers=me).status_code == 404
    client.post(f"/api/timetables/{t['id']}/publish", headers=admin)
    assert client.get(f"/api/timetables/{t['id']}", headers=me).status_code == 200


def test_streams_and_clusters_hold_only_ones_own_groups(client, admin, other_admin):
    w = World(client, admin)
    h1 = create(client, other_admin, "groups", group("ET-251"))
    h2 = create(client, other_admin, "groups", group("ET-252"))
    stream = {"name": "Anul II", "groupIds": [w.g1["id"], w.g2["id"]]}
    assert client.post("/api/streams", json=stream, headers=other_admin).status_code == 403
    assert client.post("/api/streams", json={**stream, "groupIds": [h1["id"], h2["id"]]}, headers=other_admin).status_code == 201
    # custom clusters
    assert client.post("/api/clusters", json={"name": "Mix", "groupIds": [w.g1["id"]]}, headers=other_admin).status_code == 403
    c = client.post("/api/clusters", json={"name": "Seara", "groupIds": [w.g1["id"], w.g2["id"]]}, headers=admin).json()
    assert client.put(f"/api/clusters/{c['id']}", json={"name": "Altceva"}, headers=other_admin).status_code == 403
    assert client.delete(f"/api/clusters/{c['id']}", headers=other_admin).status_code == 403
    assert client.delete(f"/api/clusters/{c['id']}", headers=admin).status_code == 204


def test_changes_and_exam_plans_only_for_ones_own_groups(client, admin, other_admin):
    w, h1, r3, a1, b1 = two_faculties(client, admin, other_admin)
    change = {"date": "2026-10-20", "kind": "room", "assignmentId": a1["id"], "slot": 1, "fromRoomId": w.r1["id"], "roomId": w.r2["id"]}
    assert client.post("/api/changes", json=change, headers=other_admin).status_code == 403
    event = {"id": "E1", "kind": "exam", "round": "session", "subjectId": w.s1["id"], "groupId": w.g1["id"], "teacherId": w.t1["id"],
             "roomId": w.r1["id"], "date": "2026-12-15", "start": "10:00", "end": "12:15"}
    plan = {"faculty": "x", "round": "session", "status": "draft", "events": [event], "updatedAt": ""}
    assert client.put("/api/exams/plans/session", json=plan, headers=other_admin).status_code == 403
    assert client.put("/api/exams/plans/session", json=plan, headers=admin).status_code == 200
