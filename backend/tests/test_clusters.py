from .helpers import World, create, group, subject


def clusters(client, headers):
    return client.get("/api/clusters", headers=headers).json()


def names(client, headers):
    return [c["name"] for c in clusters(client, headers)]


def test_the_years_always_exist(client, admin):
    cs = clusters(client, admin)
    assert [c["name"] for c in cs] == ["Year 1", "Year 2", "Year 3", "Year 4", "Master · Year 1", "Master · Year 2"]
    assert all(c["kind"] == "year" and c["groupIds"] == [] and "speciality" not in c for c in cs)
    assert client.get("/api/clusters").status_code == 401


def test_groups_make_their_clusters_by_themselves(client, admin):
    g1 = create(client, admin, "groups", group("FAF-261", year=1))
    g2 = create(client, admin, "groups", group("FAF-262", year=1))
    g3 = create(client, admin, "groups", group("TI-241", year=3))
    cs = {c["name"]: c for c in clusters(client, admin)}
    assert "FAF · Year 1" in cs and "TI · Year 3" in cs
    assert cs["FAF · Year 1"]["kind"] == "speciality" and cs["FAF · Year 1"]["speciality"] == "FAF" and cs["FAF · Year 1"]["year"] == 1
    # two FAF groups of year 1 share one cluster, and the year cluster holds every group of the year
    assert cs["FAF · Year 1"]["groupIds"] == [g1["id"], g2["id"]] and cs["Year 1"]["groupIds"] == [g1["id"], g2["id"]]
    assert cs["TI · Year 3"]["groupIds"] == [g3["id"]] and cs["Year 3"]["groupIds"] == [g3["id"]]
    assert len(names(client, admin)) == len(set(names(client, admin)))  # no cluster twice
    # clusters follow the groups when they change
    g3["year"] = 4
    client.put(f"/api/groups/{g3['id']}", json=g3, headers=admin)
    cs = {c["name"]: c for c in clusters(client, admin)}
    assert cs["TI · Year 4"]["groupIds"] == [g3["id"]] and cs["TI · Year 3"]["groupIds"] == []  # the old one stays, now empty


def test_master_groups_have_their_own_clusters(client, admin):
    m = create(client, admin, "groups", group("MIA-251", cycle="master", year=1))
    cs = {c["name"]: c for c in clusters(client, admin)}
    assert cs["Master · MIA · Year 1"]["groupIds"] == [m["id"]] and cs["Master · Year 1"]["groupIds"] == [m["id"]]
    assert cs["Year 1"]["groupIds"] == []  # not mixed with licență's first year


def test_a_group_name_without_a_number(client, admin):
    create(client, admin, "groups", group("DUAL", year=2))
    assert "DUAL · Year 2" in names(client, admin)


def test_the_dataset_carries_the_clusters(client, admin):
    create(client, admin, "groups", group("FAF-261", year=1))
    ds = client.get("/api/dataset").json()  # public
    assert any(c["name"] == "FAF · Year 1" for c in ds["clusters"])


def test_subjects_are_tagged_with_clusters(client, admin):
    create(client, admin, "groups", group("FAF-261", year=1))
    create(client, admin, "groups", group("TI-241", year=3))
    by = {c["name"]: c["id"] for c in clusters(client, admin)}
    s = create(client, admin, "subjects", subject("AM", clusterIds=[by["Year 1"], by["FAF · Year 1"]]))
    assert sorted(s["clusterIds"]) == sorted([by["Year 1"], by["FAF · Year 1"]])
    assert create(client, admin, "subjects", subject("PC"))["clusterIds"] == []
    # change the tags, leave them out (they stay), clear them
    s["clusterIds"] = [by["TI · Year 3"]]
    assert client.put(f"/api/subjects/{s['id']}", json=s, headers=admin).json()["clusterIds"] == [by["TI · Year 3"]]
    without = {k: v for k, v in s.items() if k != "clusterIds"}
    assert client.put(f"/api/subjects/{s['id']}", json={**without, "name": "Renamed"}, headers=admin).json()["clusterIds"] == [by["TI · Year 3"]]
    s["clusterIds"] = []
    assert client.put(f"/api/subjects/{s['id']}", json=s, headers=admin).json()["clusterIds"] == []
    # the same tag twice counts once; an unknown tag is refused
    s["clusterIds"] = [by["Year 1"], by["Year 1"]]
    assert client.put(f"/api/subjects/{s['id']}", json=s, headers=admin).json()["clusterIds"] == [by["Year 1"]]
    s["clusterIds"] = ["99999"]
    assert client.put(f"/api/subjects/{s['id']}", json=s, headers=admin).status_code == 422
    assert client.get("/api/subjects", headers=admin).json()[0]["clusterIds"] == [by["Year 1"]]  # the failed save changed nothing


def test_tags_survive_a_removed_group_and_go_with_a_removed_subject(client, admin, db):
    g = create(client, admin, "groups", group("FAF-261", year=1))
    by = {c["name"]: c["id"] for c in clusters(client, admin)}
    s = create(client, admin, "subjects", subject("AM", clusterIds=[by["FAF · Year 1"]]))
    client.delete(f"/api/groups/{g['id']}", headers=admin)
    assert "FAF · Year 1" in names(client, admin)  # clusters are never deleted by themselves
    assert client.get("/api/subjects", headers=admin).json()[0]["clusterIds"] == [by["FAF · Year 1"]]
    client.delete(f"/api/subjects/{s['id']}", headers=admin)
    assert db.execute("select count(*) from subject_cluster").fetchone()[0] == 0


def test_imported_subjects_have_no_tags_and_clusters_are_read_only(client, admin):
    r = client.post("/api/subjects/import", json={"subjects": [subject("S1")]}, headers=admin)
    assert r.json()[0]["clusterIds"] == []
    assert client.post("/api/clusters", json={"name": "x"}, headers=admin).status_code in (404, 405)
    assert client.delete("/api/clusters/1", headers=admin).status_code in (404, 405)


def test_semester_and_assessment_default_to_everything(client, admin):
    s = create(client, admin, "subjects", subject("AM"))
    assert (s["semester"], s["hasMidterm1"], s["hasMidterm2"], s["hasExam"], s["evaluation"]) == (1, True, True, True, "exam")
    s.update(semester=2, hasMidterm2=False, hasExam=False)
    out = client.put(f"/api/subjects/{s['id']}", json=s, headers=admin).json()
    assert (out["semester"], out["hasMidterm1"], out["hasMidterm2"], out["hasExam"], out["evaluation"]) == (2, True, False, False, "atestari")
    # an older client that only sends "evaluation" still works
    old = create(client, admin, "subjects", subject("PC", evaluation="atestari"))
    assert old["hasExam"] is False and old["hasMidterm1"] is True
    assert client.post("/api/subjects", json=subject("X", semester=3), headers=admin).status_code in (400, 422)
