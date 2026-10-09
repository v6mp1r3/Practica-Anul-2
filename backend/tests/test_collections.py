from .helpers import World, assignment, create, group, room, subject, teacher

FET = "Facultatea Electronică și Telecomunicații"
FCIM = "Facultatea Calculatoare, Informatică și Microelectronică"


def test_collections_need_a_login_for_reads_and_an_admin_for_writes(client, admin):
    assert client.get("/api/teachers").status_code == 401
    assert client.post("/api/teachers", json=teacher()).status_code == 401
    assert client.get("/api/teachers", headers=admin).json() == []


def test_teacher_roundtrip(client, admin):
    t = create(client, admin, "teachers", teacher(unavailable=["4:4", "4:5"], preferred=["1:1"], consultation="2:3", examUnavailable=["2026-12-15", "2026-12-16|am"]))
    assert t["faculty"] == FCIM  # defaults to the administrator's faculty
    assert t["unavailable"] == ["4:4", "4:5"] and t["preferred"] == ["1:1"] and t["consultation"] == "2:3"
    assert t["examUnavailable"] == ["2026-12-15", "2026-12-16|am"] and t["activityTypes"] == ["lecture", "seminar", "lab"]
    t["name"], t["maxPairsPerWeek"], t["unavailable"], t["activityTypes"], t["consultation"] = "Daniel R.", 8, [], ["lab"], None
    t.pop("consultation")
    r = client.put(f"/api/teachers/{t['id']}", json=t, headers=admin)
    assert r.status_code == 200
    got = r.json()
    assert got["name"] == "Daniel R." and got["unavailable"] == [] and got["activityTypes"] == ["lab"] and "consultation" not in got
    assert client.get("/api/teachers", headers=admin).json() == [got]
    assert client.delete(f"/api/teachers/{t['id']}", headers=admin).status_code == 204
    assert client.delete(f"/api/teachers/{t['id']}", headers=admin).status_code == 404
    assert client.put("/api/teachers/999", json=teacher(), headers=admin).status_code == 404
    assert client.put("/api/teachers/abc", json=teacher(), headers=admin).status_code == 404


def test_teacher_availability_endpoint(client, admin):
    t = create(client, admin, "teachers", teacher())
    r = client.put(f"/api/teachers/{t['id']}/availability", json={"unavailable": ["0:0"], "preferred": ["1:2"], "consultation": "3:3"}, headers=admin)
    assert r.status_code == 200
    assert (r.json()["unavailable"], r.json()["preferred"], r.json()["consultation"]) == (["0:0"], ["1:2"], "3:3")
    assert client.put(f"/api/teachers/{t['id']}/availability", json={"unavailable": ["zero"], "preferred": []}, headers=admin).status_code == 422


def test_room_roundtrip_with_equipment_and_preferences(client, admin):
    w = World(client, admin)
    r = create(client, admin, "rooms", room(name="A01", capacity=14, type="lab", equipment=["calculatoare", "proiector"], preferredSubjectIds=[w.s1["id"]], preferredGroupIds=[w.g1["id"]]))
    assert r["equipment"] == ["calculatoare", "proiector"] and r["preferredSubjectIds"] == [w.s1["id"]] and r["preferredGroupIds"] == [w.g1["id"]]
    r["equipment"] = ["tablă"]
    r.pop("preferredSubjectIds")
    out = client.put(f"/api/rooms/{r['id']}", json=r, headers=admin).json()
    assert out["equipment"] == ["tablă"] and "preferredSubjectIds" not in out
    # same building and name twice is refused
    assert client.post("/api/rooms", json=room(name="A01", building="Blocul 5"), headers=admin).status_code == 201  # other building
    assert client.post("/api/rooms", json=room(name="A01"), headers=admin).status_code == 422  # same building


def test_group_fields_language_and_validation(client, admin):
    g = create(client, admin, "groups", group("faf-251", language="ru", subgroups=2))
    assert g["name"] == "FAF-251" and g["language"] == "ru" and g["subgroups"] == 2 and g["cycle"] == "licenta" and g["programYears"] == 4
    assert create(client, admin, "groups", group("FAF-252"))["language"] == "ro"
    m = create(client, admin, "groups", group("MIA-261", cycle="master", year=1))
    assert m["cycle"] == "master" and m["programYears"] == 2
    assert client.post("/api/groups", json=group("X-1", language="de"), headers=admin).status_code == 422
    assert client.post("/api/groups", json=group("X-2", year=9), headers=admin).status_code == 422
    assert client.post("/api/groups", json=group("X-3", subgroups=5), headers=admin).status_code == 422
    assert client.post("/api/groups", json=group("FAF-251"), headers=admin).status_code == 422  # name taken
    g["size"] = 30
    assert client.put(f"/api/groups/{g['id']}", json=g, headers=admin).json()["size"] == 30


def test_subject_and_import(client, admin):
    s = create(client, admin, "subjects", subject("am", edgeOfDay=True, evaluation="atestari", lecturePairs=0.5))
    assert s["code"] == "AM" and s["edgeOfDay"] is True and s["evaluation"] == "atestari" and s["lecturePairs"] == 0.5 and s["cycle"] == "licenta"
    r = client.post("/api/subjects/import", json={"subjects": [subject("S1"), subject("S2", cycle="master")]}, headers=admin)
    assert r.status_code == 201 and [x["code"] for x in r.json()] == ["S1", "S2"] and r.json()[1]["cycle"] == "master"
    assert client.post("/api/subjects/import", json={"subjects": [subject("S1")]}, headers=admin).status_code == 422  # code taken


def test_deleting_removes_the_assignments_that_use_it(client, admin):
    w = World(client, admin)
    a1 = w.seminar(w.s1, w.t1, w.g1)
    a2 = w.seminar(w.s1, w.t2, w.g2)
    a3 = w.seminar(w.s2, w.t2, w.g1)
    ids = lambda: {a["id"] for a in client.get("/api/assignments", headers=admin).json()}
    assert ids() == {a1["id"], a2["id"], a3["id"]}
    client.delete(f"/api/teachers/{w.t1['id']}", headers=admin)
    assert ids() == {a2["id"], a3["id"]}
    client.delete(f"/api/subjects/{w.s2['id']}", headers=admin)
    assert ids() == {a2["id"]}
    client.delete(f"/api/groups/{w.g2['id']}", headers=admin)
    assert ids() == set()


def test_assignment_roundtrip(client, admin):
    w = World(client, admin)
    a = create(client, admin, "assignments", assignment(w.s1["id"], w.t1["id"], {"kind": "subgroup", "id": w.g1["id"], "subgroup": 2}, type="lab", roomType="lab", equipment=["calculatoare"], pairsPerWeek=0.5 + 0.5, pairsPerSession=2))
    assert a["audience"] == {"kind": "subgroup", "id": w.g1["id"], "subgroup": 2} and a["equipment"] == ["calculatoare"] and a["pairsPerSession"] == 2 and "parity" not in a
    a["pairsPerWeek"] = 2
    a["audience"] = {"kind": "group", "id": w.g2["id"]}
    out = client.put(f"/api/assignments/{a['id']}", json=a, headers=admin).json()
    assert out["pairsPerWeek"] == 2 and out["audience"] == {"kind": "group", "id": w.g2["id"]}
    # the same load twice, a subgroup without a number, a missing teacher
    dup = assignment(w.s1["id"], w.t1["id"], {"kind": "group", "id": w.g2["id"]}, type="lab", roomType="lab")
    dup["type"] = a["type"]
    assert client.post("/api/assignments", json={**a, "id": None}, headers=admin).status_code == 422
    assert client.post("/api/assignments", json=assignment(w.s1["id"], w.t1["id"], {"kind": "subgroup", "id": w.g1["id"]}), headers=admin).status_code == 422
    assert client.post("/api/assignments", json=assignment(w.s1["id"], "999", {"kind": "group", "id": w.g1["id"]}), headers=admin).status_code == 422


def test_automatic_streams_per_lecture(client, admin):
    """AM is attended by TI-261, TI-262, IA-261, IA-262 and PC by TI-261, TI-262, SI-261, SI-262: two streams."""
    g = {n: create(client, admin, "groups", group(n)) for n in ("TI-261", "TI-262", "IA-261", "IA-262", "SI-261", "SI-262")}
    t = create(client, admin, "teachers", teacher())
    am, pc = create(client, admin, "subjects", subject("AM")), create(client, admin, "subjects", subject("PC"))
    ids = lambda *names: [g[n]["id"] for n in names]
    a1 = create(client, admin, "assignments", assignment(am["id"], t["id"], {"kind": "stream", "groupIds": ids("TI-261", "TI-262", "IA-261", "IA-262")}))
    a2 = create(client, admin, "assignments", assignment(pc["id"], t["id"], {"kind": "stream", "groupIds": ids("TI-261", "TI-262", "SI-261", "SI-262")}))
    s1, s2 = a1["audience"]["id"], a2["audience"]["id"]
    assert s1 != s2
    streams = {s["id"]: s for s in client.get("/api/streams", headers=admin).json()}
    assert sorted(streams[s1]["groupIds"]) == sorted(ids("TI-261", "TI-262", "IA-261", "IA-262")) and streams[s1]["name"].startswith("AM: ")
    assert sorted(streams[s2]["groupIds"]) == sorted(ids("TI-261", "TI-262", "SI-261", "SI-262"))
    # the same lecture for the same groups, in any order, finds the same stream (seminar type -> separate assignment)
    a3 = create(client, admin, "assignments", assignment(am["id"], t["id"], {"kind": "stream", "groupIds": ids("IA-262", "IA-261", "TI-262", "TI-261")}, type="seminar", roomType="seminar"))
    assert a3["audience"]["id"] == s1 and len(client.get("/api/streams", headers=admin).json()) == 2
    # a stream of one group is not a stream
    assert client.post("/api/assignments", json=assignment(am["id"], t["id"], {"kind": "stream", "groupIds": ids("TI-261")}, type="lab", roomType="lab"), headers=admin).status_code == 422
    # PC's automatic stream cannot be used for AM's lecture
    bad = assignment(am["id"], t["id"], {"kind": "stream", "id": s2}, type="lab", roomType="lab")
    r = client.post("/api/assignments", json=bad, headers=admin)
    assert r.status_code == 422 and "another subject" in r.json()["message"]
    # removing a group takes it out of the streams, deleting a stream removes the lecture that used it
    client.delete(f"/api/groups/{g['IA-262']['id']}", headers=admin)
    assert len(client.get("/api/streams", headers=admin).json()) == 2
    assert client.delete(f"/api/streams/{s2}", headers=admin).status_code == 204
    assert {a["id"] for a in client.get("/api/assignments", headers=admin).json()} == {a1["id"], a3["id"]}


def test_predefined_stream_serves_every_subject(client, admin):
    w = World(client, admin)
    s = create(client, admin, "streams", {"name": "FAF", "groupIds": [w.g1["id"], w.g2["id"]]})
    assert s["name"] == "FAF" and s["groupIds"] == [w.g1["id"], w.g2["id"]]
    a1 = create(client, admin, "assignments", assignment(w.s1["id"], w.t1["id"], {"kind": "stream", "id": s["id"]}))
    a2 = create(client, admin, "assignments", assignment(w.s2["id"], w.t2["id"], {"kind": "stream", "id": s["id"]}))
    assert a1["audience"]["id"] == a2["audience"]["id"] == s["id"]
    s["groupIds"] = [w.g1["id"]]
    assert client.put(f"/api/streams/{s['id']}", json=s, headers=admin).status_code == 422  # needs 2 groups
    assert client.post("/api/streams", json={"name": "FAF", "groupIds": [w.g1["id"], w.g2["id"]]}, headers=admin).status_code == 422  # name taken
    assert client.post("/api/streams", json={"name": "", "groupIds": [w.g1["id"], w.g2["id"]]}, headers=admin).status_code == 422


def test_faculty_limits(client, admin, other_admin):
    # FCIM's administrator creates, FET's administrator can read but not change
    w = World(client, admin)
    a = w.seminar(w.s1, w.t1, w.g1)
    assert client.get("/api/groups", headers=other_admin).status_code == 200
    for method, path, body in (
        ("put", f"/api/groups/{w.g1['id']}", w.g1), ("delete", f"/api/groups/{w.g1['id']}", None),
        ("put", f"/api/teachers/{w.t1['id']}", w.t1), ("delete", f"/api/rooms/{w.r1['id']}", None),
        ("delete", f"/api/subjects/{w.s1['id']}", None), ("delete", f"/api/assignments/{a['id']}", None),
        ("put", f"/api/teachers/{w.t1['id']}/availability", {"unavailable": [], "preferred": []}),
    ):
        r = client.request(method.upper(), path, json=body, headers=other_admin)
        assert r.status_code == 403, (method, path, r.text)
    # nor can they create records for someone else's faculty, or teach other faculties' groups
    assert client.post("/api/groups", json=group("X-1", faculty=FCIM), headers=other_admin).status_code == 403
    mine = create(client, other_admin, "groups", group("ET-251"))
    assert mine["faculty"] == FET
    assert client.post("/api/assignments", json=assignment(w.s1["id"], w.t1["id"], {"kind": "group", "id": w.g1["id"]}, type="lab", roomType="lab"), headers=other_admin).status_code == 403
    assert client.post("/api/assignments", json=assignment(w.s1["id"], w.t1["id"], {"kind": "group", "id": mine["id"]}), headers=other_admin).status_code == 201
    # a shared record (no faculty) can be changed by anyone
    shared = create(client, admin, "teachers", teacher(name="Shared", email="s@example.md", faculty=""))
    assert "faculty" not in shared
    assert client.delete(f"/api/teachers/{shared['id']}", headers=other_admin).status_code == 204


def test_missing_fields_and_bad_values_are_422(client, admin):
    assert client.post("/api/rooms", json={"name": "X"}, headers=admin).status_code == 422
    assert client.post("/api/rooms", json=room(capacity=0), headers=admin).status_code == 422
    assert client.post("/api/teachers", json=teacher(maxPairsPerWeek=0), headers=admin).status_code == 422
    assert client.post("/api/teachers", json=teacher(activityTypes=["dance"]), headers=admin).status_code == 422
    assert client.post("/api/subjects", json=subject("X", year=7), headers=admin).status_code == 422
    assert client.post("/api/groups", json=group("X-9", faculty="Nonexistent"), headers=admin).status_code == 403
    assert client.post("/api/teachers", json=teacher(faculty="Nonexistent"), headers=admin).status_code == 403
    r = client.post("/api/rooms", json={"name": "X"}, headers=admin)
    assert set(r.json()) == {"message"}


def test_project_hours_and_half_pair_loads(client, admin):
    t = create(client, admin, "teachers", teacher(email="proj@example.md", activityTypes=["seminar", "project"], maxPairsPerWeek=4.5))
    assert t["activityTypes"] == ["seminar", "project"] and t["maxPairsPerWeek"] == 4.5
    t["maxPairsPerWeek"] = 0.5
    assert client.put(f"/api/teachers/{t['id']}", json=t, headers=admin).json()["maxPairsPerWeek"] == 0.5
    assert client.post("/api/teachers", json=teacher(email="x@example.md", maxPairsPerWeek=0), headers=admin).status_code == 422
    # whole numbers stay whole numbers
    assert create(client, admin, "teachers", teacher(email="y@example.md", maxPairsPerWeek=12))["maxPairsPerWeek"] == 12
    # an assignment can be a project, held in an ordinary room
    w = World(client, admin)
    a = create(client, admin, "assignments", assignment(w.s1["id"], t["id"], {"kind": "group", "id": w.g1["id"]}, type="project", roomType="seminar"))
    assert a["type"] == "project" and a["roomType"] == "seminar"
    assert client.post("/api/teachers", json=teacher(email="z@example.md", activityTypes=["dance"]), headers=admin).status_code == 422
