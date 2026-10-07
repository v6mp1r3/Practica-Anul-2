import time

from .helpers import World, assignment, create, group, room, teacher
from .test_timetables import lesson, save


def start(client, headers, body):
    return client.post("/api/generate", json=body, headers=headers)


def wait(client, headers, job_id, timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        job = client.get(f"/api/generate/{job_id}", headers=headers).json()
        if job["status"] != "running":
            return job
        time.sleep(0.3)
    raise AssertionError("the job did not finish")


def world_with_loads(client, admin):
    w = World(client, admin)
    w.lec = w.lecture(w.s1, w.t1, [w.g1["id"], w.g2["id"]])
    w.sem1 = w.seminar(w.s1, w.t2, w.g1)
    w.sem2 = w.seminar(w.s2, w.t2, w.g2)
    return w


def test_generate_makes_variants_the_client_can_use(client, admin):
    w = world_with_loads(client, admin)
    ids = [w.g1["id"], w.g2["id"]]
    r = start(client, admin, {"groupIds": ids, "variants": 2, "iterations": 100, "seed": 7})
    assert r.status_code == 202 and set(r.json()) == {"jobId"}
    job = wait(client, admin, r.json()["jobId"])
    assert job["status"] == "done" and job["progress"]["progress"] == 1 and job["progress"]["best"]["hard"] == 0
    assert len(job["timetableIds"]) == 2
    for n, tid in enumerate(job["timetableIds"]):
        t = client.get(f"/api/timetables/{tid}", headers=admin).json()
        assert t["status"] == "variant" and t["name"] == f"Varianta {'AB'[n]}" and sorted(t["groupIds"]) == sorted(ids)
        assert t["algorithm"].startswith("CP-SAT + LNS (seed ") and t["score"]["hard"] == 0
        assert len(t["lessons"]) == 3  # one lecture pair and two seminar pairs, as the loads require
    # the variant is a normal timetable: save it (becomes a draft), publish it
    saved = client.put(f"/api/timetables/{t['id']}", json=t, headers=admin).json()
    assert saved["status"] == "draft" and saved["score"]["hard"] == 0
    assert client.post(f"/api/timetables/{saved['id']}/publish", headers=admin).status_code == 200


def test_new_run_replaces_old_variants_but_not_drafts(client, admin):
    w = world_with_loads(client, admin)
    body = {"groupIds": [w.g1["id"], w.g2["id"]], "variants": 1, "iterations": 100, "seed": 1}
    first = wait(client, admin, start(client, admin, body).json()["jobId"])
    draft = client.put(f"/api/timetables/{first['timetableIds'][0]}", json=client.get(f"/api/timetables/{first['timetableIds'][0]}", headers=admin).json(), headers=admin).json()
    second = wait(client, admin, start(client, admin, body).json()["jobId"])
    listing = {t["id"]: t["status"] for t in client.get("/api/timetables", headers=admin).json()}
    assert listing == {draft["id"]: "draft", second["timetableIds"][0]: "variant"}


def test_locked_pairs_are_kept_and_published_pairs_stay_booked(client, admin, other_admin):
    w = world_with_loads(client, admin)
    # another faculty has a published pair that books teacher t1 and room r1 at Monday 2nd pair
    h1 = create(client, other_admin, "groups", group("ET-251"))
    b1 = create(client, other_admin, "assignments", assignment(w.s2["id"], w.t1["id"], {"kind": "group", "id": h1["id"]}, type="seminar", roomType="seminar"))
    other = save(client, other_admin, "FET", [h1["id"]], [lesson(b1["id"], 0, 1, w.r1["id"])])
    client.post(f"/api/timetables/{other['id']}/publish", headers=other_admin)
    # an earlier timetable of ours with one pair locked
    base = save(client, admin, "base", [w.g1["id"], w.g2["id"]], [lesson(w.sem1["id"], 2, 3, w.r2["id"], locked=True), lesson(w.sem2["id"], 3, 3, w.r2["id"])])
    ids = [w.g1["id"], w.g2["id"]]
    job = wait(client, admin, start(client, admin, {"groupIds": ids, "variants": 1, "iterations": 100, "seed": 3, "baseTimetableId": base["id"]}).json()["jobId"])
    t = client.get(f"/api/timetables/{job['timetableIds'][0]}", headers=admin).json()
    by = {}
    for l in t["lessons"]:
        by.setdefault(l["assignmentId"], []).append(l)
    locked = by[w.sem1["id"]][0]
    assert (locked["day"], locked["slot"], locked["roomId"], locked["locked"]) == (2, 3, w.r2["id"], True) and len(by[w.sem1["id"]]) == 1
    assert len(by[w.sem2["id"]]) == 1 and len(by[w.lec["id"]]) == 1  # the unlocked pair was placed again
    # the other faculty's pair is in the result, where it was, and nothing of ours clashes with it
    kept = by[b1["id"]][0]
    assert (kept["day"], kept["slot"], kept["roomId"]) == (0, 1, w.r1["id"])
    for l in t["lessons"]:
        if l["assignmentId"] != b1["id"] and (l["day"], l["slot"]) == (0, 1):
            assert l["roomId"] != w.r1["id"]
            assert l["assignmentId"] not in (w.lec["id"],)  # the lecture's teacher is t1, who is busy then
    assert sorted(t["groupIds"]) == sorted(ids)  # only the chosen groups belong to the variant


def test_job_progress_and_failure(client, admin, monkeypatch):
    w = world_with_loads(client, admin)
    from app.services import generation

    def boom(*a, **k):
        raise RuntimeError("the solver exploded")

    monkeypatch.setattr(generation, "generate_timetable", boom)
    job = wait(client, admin, start(client, admin, {"groupIds": [w.g1["id"]], "variants": 1, "iterations": 100}).json()["jobId"])
    assert job["status"] == "failed" and "exploded" in job["error"]
    assert client.get("/api/generate/999", headers=admin).status_code == 404
    assert client.get("/api/generate/abc", headers=admin).status_code == 404


def test_requests_are_checked(client, admin, other_admin):
    w = world_with_loads(client, admin)
    ok = {"groupIds": [w.g1["id"]], "variants": 1, "iterations": 100}
    assert start(client, {}, ok).status_code == 401
    assert start(client, admin, {**ok, "groupIds": []}).status_code == 422
    assert start(client, admin, {**ok, "groupIds": ["999"]}).status_code == 422
    assert start(client, admin, {**ok, "variants": 0}).status_code == 422
    assert start(client, admin, {**ok, "iterations": "many"}).status_code == 422
    assert start(client, admin, {**ok, "seed": "x"}).status_code == 422
    assert start(client, admin, {**ok, "baseTimetableId": "999"}).status_code == 404
    assert start(client, other_admin, ok).status_code == 403  # FCIM's group, FET's administrator
    assert client.get("/api/generate/1").status_code == 401


def test_unfinished_jobs_are_failed_when_the_server_starts(client, db):
    from app.services.generation import mark_orphans

    db.execute("insert into generation_job (status, params) values ('running', '{}'), ('done', '{}')")
    mark_orphans()
    assert [r[0] for r in db.execute("select status::text from generation_job order by id")] == ["failed", "done"]
