from .helpers import World, assignment, create, group, room, subject, teacher


def lesson(assignment_id, day, slot, room_id, lid="L", **kw):
    return {"id": lid, "assignmentId": assignment_id, "day": day, "slot": slot, "roomId": room_id, "parity": "weekly", **kw}


def save(client, headers, name, group_ids, lessons, status="draft", tid="new"):
    r = client.put(f"/api/timetables/{tid}", json={"name": name, "status": status, "algorithm": "test", "groupIds": group_ids, "lessons": lessons}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_save_computes_the_score_on_the_server(client, admin):
    w = World(client, admin)
    lec = w.lecture(w.s1, w.t1, [w.g1["id"], w.g2["id"]])
    sem = w.seminar(w.s1, w.t2, w.g1)
    # valid: lecture Monday 2nd pair, seminar Monday 3rd pair, no gaps
    ok = save(client, admin, "A", [w.g1["id"], w.g2["id"]], [lesson(lec["id"], 0, 1, w.r1["id"], "a"), lesson(sem["id"], 0, 2, w.r2["id"], "b")])
    assert ok["status"] == "draft" and ok["score"]["hard"] == 0
    assert set(ok["score"]["breakdown"]) == {"teacherGaps", "groupGaps", "earlyStarts", "dayOverload", "unevenDays", "preferenceMisses", "roomMisses", "edgeMisses", "shiftMisses"}
    assert ok["score"]["breakdown"]["groupGaps"] == 0 and ok["score"]["breakdown"]["shiftMisses"] == 0
    assert ok["createdAt"].endswith("Z") and ok["updatedAt"].endswith("Z") and len(ok["lessons"]) == 2
    # a gap for group 1 between the pairs costs 12 per empty pair
    gap = save(client, admin, "B", [w.g1["id"], w.g2["id"]], [lesson(lec["id"], 0, 1, w.r1["id"], "a"), lesson(sem["id"], 0, 3, w.r2["id"], "b")])
    assert gap["score"]["hard"] == 0 and gap["score"]["breakdown"]["groupGaps"] == 1 and gap["score"]["soft"] > ok["score"]["soft"]
    # the same teacher cannot be in two places, nor can a group
    clash = save(client, admin, "C", [w.g1["id"], w.g2["id"]], [lesson(lec["id"], 0, 1, w.r1["id"], "a"), lesson(sem["id"], 0, 1, w.r1["id"], "b")])
    assert clash["score"]["hard"] >= 2  # group clash and room clash
    # missing and extra hours are hard problems too
    assert save(client, admin, "D", [w.g1["id"]], [lesson(lec["id"], 0, 1, w.r1["id"], "a")])["score"]["hard"] == 1
    assert save(client, admin, "E", [w.g1["id"]], [lesson(lec["id"], 0, 1, w.r1["id"], "a"), lesson(lec["id"], 1, 1, w.r1["id"], "b"), lesson(sem["id"], 2, 2, w.r2["id"], "c")])["score"]["hard"] == 1


def test_variant_becomes_a_draft_and_lesson_ids_stay_stable(client, admin):
    w = World(client, admin)
    a = w.seminar(w.s1, w.t1, w.g1)
    b = w.seminar(w.s2, w.t2, w.g1)
    t = save(client, admin, "V", [w.g1["id"]], [lesson(a["id"], 0, 1, w.r1["id"], "x1")], status="variant")
    assert t["status"] == "draft"
    first_id = t["lessons"][0]["id"]
    assert first_id.isdigit()
    again = save(client, admin, "V2", [w.g1["id"]], [{**t["lessons"][0], "slot": 2, "locked": True}, lesson(b["id"], 1, 1, w.r2["id"], "new")], tid=t["id"])
    assert again["id"] == t["id"] and again["name"] == "V2"
    kept = [l for l in again["lessons"] if l["id"] == first_id]
    assert kept and kept[0]["slot"] == 2 and kept[0]["locked"] is True and len(again["lessons"]) == 2
    # dated pair (reduced attendance)
    dated = save(client, admin, "D", [w.g1["id"]], [lesson(a["id"], 5, 0, w.r1["id"], "d", date="2026-10-17")], tid=t["id"])
    assert dated["lessons"][0]["date"] == "2026-10-17" and len(dated["lessons"]) == 1
    assert client.get(f"/api/timetables/{t['id']}", headers=admin).json() == dated


def test_listing_hides_old_variants(client, db, admin):
    w = World(client, admin)
    a = w.seminar(w.s1, w.t1, w.g1)
    old = save(client, admin, "old", [w.g1["id"]], [lesson(a["id"], 0, 1, w.r1["id"])])
    db.execute("update timetable set status = 'variant', created_at = now() - interval '2 days' where id = %s", (int(old["id"]),))
    fresh = save(client, admin, "fresh", [w.g1["id"]], [lesson(a["id"], 0, 1, w.r1["id"])])
    db.execute("update timetable set status = 'variant' where id = %s", (int(fresh["id"]),))
    names = [t["name"] for t in client.get("/api/timetables", headers=admin).json()]
    assert names == ["fresh"]
    assert client.get("/api/timetables").status_code == 401  # list is for administrators
    assert client.get(f"/api/timetables/{old['id']}", headers=admin).status_code == 200  # but it still exists


def test_delete_and_missing(client, admin):
    w = World(client, admin)
    a = w.seminar(w.s1, w.t1, w.g1)
    t = save(client, admin, "T", [w.g1["id"]], [lesson(a["id"], 0, 1, w.r1["id"])])
    assert client.delete(f"/api/timetables/{t['id']}", headers=admin).status_code == 204
    assert client.get(f"/api/timetables/{t['id']}", headers=admin).status_code == 404
    assert client.delete(f"/api/timetables/{t['id']}", headers=admin).status_code == 404
    assert client.get("/api/timetables/published").json() is None


def two_faculties(client, admin, other_admin):
    """FCIM has group g1, FET has group h1; they share two teachers and three rooms."""
    w = World(client, admin)
    h1 = create(client, other_admin, "groups", group("ET-251"))
    r3 = create(client, admin, "rooms", room(name="3-406"))
    a1 = w.seminar(w.s1, w.t1, w.g1)  # FCIM
    b1 = create(client, other_admin, "assignments", assignment(w.s2["id"], w.t2["id"], {"kind": "group", "id": h1["id"]}, type="seminar", roomType="seminar"))
    return w, h1, r3, a1, b1


def test_publish_merges_faculties_and_notifies(client, admin, other_admin):
    w, h1, r3, a1, b1 = two_faculties(client, admin, other_admin)
    ta = save(client, admin, "FCIM", [w.g1["id"]], [lesson(a1["id"], 1, 1, w.r1["id"])])
    tb = save(client, other_admin, "FET", [h1["id"]], [lesson(b1["id"], 2, 1, w.r2["id"])])
    assert client.get("/api/timetables/published").json() is None
    r = client.post(f"/api/timetables/{ta['id']}/publish", headers=admin)
    assert r.status_code == 200 and r.json()["status"] == "published"
    assert client.get("/api/timetables/published").json()["id"] == ta["id"]  # public, no token
    r = client.post(f"/api/timetables/{tb['id']}/publish", headers=other_admin)
    assert r.status_code == 200, r.text
    pub = client.get("/api/timetables/published").json()
    assert pub["id"] == tb["id"] and sorted(pub["groupIds"]) == sorted([w.g1["id"], h1["id"]]) and len(pub["lessons"]) == 2
    assert client.get(f"/api/timetables/{ta['id']}", headers=admin).json()["status"] == "draft"  # the previous one is a draft again
    kinds = [(n["kind"], n.get("params")) for n in client.get("/api/notifications", headers=admin).json()]
    assert kinds == [("updated", {"name": "FET", "count": 1}), ("published", {"name": "FCIM"})]
    # only one published timetable exists
    assert [t["status"] for t in client.get("/api/timetables", headers=admin).json()].count("published") == 1


def test_publish_refuses_a_clash_with_another_faculty(client, admin, other_admin):
    w, h1, r3, a1, b1 = two_faculties(client, admin, other_admin)
    ta = save(client, admin, "FCIM", [w.g1["id"]], [lesson(a1["id"], 1, 1, w.r1["id"])])
    client.post(f"/api/timetables/{ta['id']}/publish", headers=admin)
    c1 = create(client, other_admin, "assignments", assignment(w.s2["id"], w.t1["id"], {"kind": "group", "id": h1["id"]}, type="lab", roomType="lab"))
    # same teacher (t1) at the same time as FCIM's published pair
    tc = save(client, other_admin, "FET", [h1["id"]], [lesson(c1["id"], 1, 1, w.r2["id"]), lesson(b1["id"], 3, 1, w.r2["id"])])
    r = client.post(f"/api/timetables/{tc['id']}/publish", headers=other_admin)
    assert r.status_code == 409 and "clash" in r.json()["message"]
    assert client.get("/api/timetables/published").json()["id"] == ta["id"]  # nothing changed


def test_unpublish_withdraws_only_my_faculty(client, admin, other_admin):
    w, h1, r3, a1, b1 = two_faculties(client, admin, other_admin)
    ta = save(client, admin, "FCIM", [w.g1["id"]], [lesson(a1["id"], 1, 1, w.r1["id"])])
    tb = save(client, other_admin, "FET", [h1["id"]], [lesson(b1["id"], 2, 1, w.r2["id"])])
    client.post(f"/api/timetables/{ta['id']}/publish", headers=admin)
    client.post(f"/api/timetables/{tb['id']}/publish", headers=other_admin)  # now one published timetable for both
    r = client.post(f"/api/timetables/{tb['id']}/unpublish", headers=admin)
    assert r.status_code == 200
    mine = r.json()
    assert mine["status"] == "draft" and mine["id"] != tb["id"] and mine["groupIds"] == [w.g1["id"]] and len(mine["lessons"]) == 1 and mine["score"]
    pub = client.get("/api/timetables/published").json()
    assert pub["id"] == tb["id"] and pub["groupIds"] == [h1["id"]] and len(pub["lessons"]) == 1
    note = client.get("/api/notifications", headers=admin).json()[0]
    assert note["kind"] == "unpublished" and note["groupIds"] == [w.g1["id"]] and note["teacherIds"] == [w.t1["id"]]
    # FET withdraws what is left
    assert client.post(f"/api/timetables/{tb['id']}/unpublish", headers=other_admin).json()["status"] == "draft"
    assert client.get("/api/timetables/published").json() is None
    assert client.post(f"/api/timetables/{tb['id']}/unpublish", headers=other_admin).status_code == 409


def test_unpublish_by_an_unrelated_faculty_is_forbidden(client, db, admin, other_admin):
    w = World(client, admin)
    a = w.seminar(w.s1, w.t1, w.g1)
    t = save(client, admin, "FCIM", [w.g1["id"]], [lesson(a["id"], 1, 1, w.r1["id"])])
    client.post(f"/api/timetables/{t['id']}/publish", headers=admin)
    assert client.post(f"/api/timetables/{t['id']}/unpublish", headers=other_admin).status_code == 403
    assert client.post("/api/timetables/999/publish", headers=admin).status_code == 404


def test_republishing_the_published_one_is_harmless(client, admin):
    w = World(client, admin)
    a = w.seminar(w.s1, w.t1, w.g1)
    t = save(client, admin, "T", [w.g1["id"]], [lesson(a["id"], 1, 1, w.r1["id"])])
    assert client.post(f"/api/timetables/{t['id']}/publish", headers=admin).status_code == 200
    r = client.post(f"/api/timetables/{t['id']}/publish", headers=admin)
    assert r.status_code == 200 and r.json()["status"] == "published" and len(r.json()["lessons"]) == 1
    assert [n["params"]["count"] for n in client.get("/api/notifications", headers=admin).json() if n["kind"] == "updated"] == [0]
