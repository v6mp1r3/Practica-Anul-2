from .helpers import World, create, group, subject


def clusters(client, headers):
    return client.get("/api/clusters", headers=headers).json()


def names(client, headers):
    return [c["name"] for c in clusters(client, headers)]


def test_the_years_always_exist(client, admin):
    cs = clusters(client, admin)
    assert [c["name"] for c in cs if c["kind"] == "year"] == ["Year 1", "Year 2", "Year 3", "Year 4", "Master · Year 1", "Master · Year 2"]
    assert [c["name"] for c in cs if c["kind"] == "language"] == ["Language · RO", "Language · RU", "Language · EN", "Language · FR"]
    assert [c["name"] for c in cs if c["kind"] == "form"] == ["Full-time", "Reduced attendance", "Dual"]
    assert all(c["groupIds"] == [] and "speciality" not in c for c in cs)
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
    create(client, admin, "groups", group("TI-261", year=1))
    create(client, admin, "groups", group("TI-241", year=3))
    create(client, admin, "groups", group("SI-241", year=3))
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
    create(client, admin, "groups", group("TI-261", year=1))
    by = {c["name"]: c["id"] for c in clusters(client, admin)}
    s = create(client, admin, "subjects", subject("AM", clusterIds=[by["FAF · Year 1"]]))
    client.delete(f"/api/groups/{g['id']}", headers=admin)
    assert "FAF · Year 1" in names(client, admin)  # clusters are never deleted by themselves
    assert client.get("/api/subjects", headers=admin).json()[0]["clusterIds"] == [by["FAF · Year 1"]]
    client.delete(f"/api/subjects/{s['id']}", headers=admin)
    assert db.execute("select count(*) from subject_cluster").fetchone()[0] == 0


def test_imported_subjects_have_no_tags(client, admin):
    r = client.post("/api/subjects/import", json={"subjects": [subject("S1")]}, headers=admin)
    assert r.json()[0]["clusterIds"] == []


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


def test_groups_are_clustered_by_language_and_form(client, admin):
    a = create(client, admin, "groups", group("FAF-261", year=1, language="ru", studyForm="reduced"))
    b = create(client, admin, "groups", group("TI-261", year=1))
    by = {c["name"]: c for c in clusters(client, admin)}
    assert by["Language · RU"]["groupIds"] == [a["id"]] and by["Language · RO"]["groupIds"] == [b["id"]]
    assert by["Reduced attendance"]["groupIds"] == [a["id"]] and by["Full-time"]["groupIds"] == [b["id"]]
    a["language"], a["studyForm"] = "en", "full"
    client.put(f"/api/groups/{a['id']}", json=a, headers=admin)
    by = {c["name"]: c for c in clusters(client, admin)}
    assert by["Language · EN"]["groupIds"] == [a["id"]] and by["Language · RU"]["groupIds"] == []
    assert by["Full-time"]["groupIds"] == [a["id"], b["id"]]


def test_custom_clusters(client, admin, user_headers=None):
    g = create(client, admin, "groups", group("FAF-261", year=1))
    r = client.post("/api/clusters", json={"name": " Frecvență redusă 2026 ", "groupIds": [g["id"]]}, headers=admin)
    assert r.status_code == 201
    c = r.json()
    assert (c["kind"], c["name"], c["groupIds"]) == ("custom", "Frecvență redusă 2026", [g["id"]])
    assert "year" not in c and "cycle" not in c
    assert client.post("/api/clusters", json={"name": "frecvență redusă 2026"}, headers=admin).status_code == 409
    assert client.post("/api/clusters", json={"name": "  "}, headers=admin).status_code == 422
    assert client.post("/api/clusters", json={"name": "X", "groupIds": ["999"]}, headers=admin).status_code == 422
    assert client.post("/api/clusters", json={"name": "X"}).status_code == 401
    # rename keeps the groups when they are not mentioned; they can also be replaced
    r = client.put(f"/api/clusters/{c['id']}", json={"name": "Special"}, headers=admin).json()
    assert r["name"] == "Special" and r["groupIds"] == [g["id"]]
    assert client.put(f"/api/clusters/{c['id']}", json={"name": "Special", "groupIds": []}, headers=admin).json()["groupIds"] == []
    # it can tag a subject, and removing it takes the tag away
    s = create(client, admin, "subjects", subject("AM", clusterIds=[c["id"]]))
    assert s["clusterIds"] == [c["id"]]
    assert client.delete(f"/api/clusters/{c['id']}", headers=admin).status_code == 204
    assert client.get("/api/subjects", headers=admin).json()[0]["clusterIds"] == []
    assert client.delete(f"/api/clusters/{c['id']}", headers=admin).status_code == 404


def test_automatic_clusters_cannot_be_changed(client, admin):
    year1 = next(c for c in clusters(client, admin) if c["name"] == "Year 1")
    assert client.put(f"/api/clusters/{year1['id']}", json={"name": "x"}, headers=admin).status_code == 400
    assert client.delete(f"/api/clusters/{year1['id']}", headers=admin).status_code == 400


def test_all_the_specialities_of_a_year_become_the_year(client, admin):
    create(client, admin, "groups", group("FAF-261", year=1))
    create(client, admin, "groups", group("TI-261", year=1))
    create(client, admin, "groups", group("TI-241", year=3))
    by = {c["name"]: c["id"] for c in clusters(client, admin)}
    s = create(client, admin, "subjects", subject("AM", clusterIds=[by["FAF · Year 1"]]))
    assert s["clusterIds"] == [by["FAF · Year 1"]]  # only a part of the year: kept as it is
    s["clusterIds"] = [by["FAF · Year 1"], by["TI · Year 1"], by["Language · RO"], by["TI · Year 3"]]
    out = client.put(f"/api/subjects/{s['id']}", json=s, headers=admin).json()["clusterIds"]
    assert sorted(out) == sorted([by["Year 1"], by["Language · RO"], by["Year 3"]])  # year 3 has one speciality: TI is all of it


def test_a_tagged_subject_is_only_for_the_groups_its_tags_allow(client, admin):
    from .helpers import assignment

    g1 = create(client, admin, "groups", group("FAF-261", year=1))
    g1b = create(client, admin, "groups", group("TI-261", year=1))
    g2 = create(client, admin, "groups", group("FAF-251", year=2))
    t = create(client, admin, "teachers", {"name": "Prof", "activityTypes": ["lecture"], "maxPairsPerWeek": 10})
    by = {c["name"]: c["id"] for c in clusters(client, admin)}
    tagged = create(client, admin, "subjects", subject("AM", clusterIds=[by["Year 1"]]))
    free = create(client, admin, "subjects", subject("PC"))

    def post(subj, groups):
        aud = {"kind": "stream", "groupIds": groups} if len(groups) > 1 else {"kind": "group", "id": groups[0]}
        return client.post("/api/assignments", json=assignment(subj["id"], t["id"], aud), headers=admin)

    assert post(tagged, [g1["id"], g1b["id"]]).status_code == 201  # both groups of year 1
    assert post(tagged, [g2["id"]]).status_code == 422             # a group of year 2
    assert post(tagged, [g1["id"], g2["id"]]).status_code == 422   # one wrong group is enough
    assert post(free, [g2["id"]]).status_code == 201               # no tags: no restriction here


def test_subject_abbreviation(client, admin):
    s = create(client, admin, "subjects", subject("AM", abbreviation=" Analiză "))
    assert s["abbreviation"] == "Analiză"
    assert "abbreviation" not in create(client, admin, "subjects", subject("PC"))
    s["abbreviation"] = ""
    assert "abbreviation" not in client.put(f"/api/subjects/{s['id']}", json=s, headers=admin).json()
