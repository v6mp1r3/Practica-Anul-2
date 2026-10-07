import copy

from .helpers import World, create, group


def get_settings(client):
    return client.get("/api/dataset").json()["settings"]


def test_dataset_is_public_and_seeded(client):
    ds = client.get("/api/dataset").json()
    assert set(ds) == {"settings", "teachers", "rooms", "groups", "streams", "subjects", "assignments"}
    s = ds["settings"]
    assert s["institutionName"] == "Universitatea Tehnică a Moldovei" and s["semester"] == "Toamna 2026/2027"
    assert len(s["faculties"]) == 14 and len(s["slots"]) == 7 and s["slots"][0] == {"start": "08:00", "end": "09:30"}
    assert s["formDays"] == {"full": [0, 1, 2, 3, 4], "reduced": [0, 1, 2, 3, 4, 5, 6], "dual": [0, 1, 2, 3, 4]}
    assert s["formMaxPairs"] == {"full": 4, "reduced": 6, "dual": 4}
    assert s["yearShifts"][0] == {"first": 0, "last": 3} and s["masterYearShifts"] == [{"first": 4, "last": 6}] * 2
    assert s["reducedSessions"][0] == {"start": "2026-10-12", "end": "2026-10-25"}
    ev = s["evaluation"]
    assert ev["semesterStart"] == "2026-08-31" and ev["midtermWeeks"] == [7, 14] and ev["midtermStartTimes"] == ["15:15", "17:00", "18:45"]
    assert len(ev["examSession"]) == 2 and ev["examDays"] == [0, 1, 2, 3, 4] and ev["reducedExamDays"] == [0, 1, 2, 3, 4, 5, 6]
    # master's carries only what differs from licență (frontend/src/domain/exams.ts DEFAULT_MASTER)
    assert set(s["masterEvaluation"]) == {"startOffsetWeeks", "midtermWeeks", "midtermRetakeWeeks", "examSession", "reexamSession", "examDays", "examFrom", "examTo", "consultation", "reexamFrom", "reexamTo"}
    assert s["masterEvaluation"]["startOffsetWeeks"] == 4 and s["masterEvaluation"]["consultation"] == "sameDay"


def test_saving_settings_unchanged_changes_nothing(client, admin):
    before = get_settings(client)
    r = client.put("/api/settings", json=before, headers=admin)
    assert r.status_code == 200 and r.json() == before
    assert get_settings(client) == before


def test_settings_need_an_admin(client):
    assert client.put("/api/settings", json=get_settings(client)).status_code == 401


def test_change_settings_and_calendar(client, admin):
    w = World(client, admin)
    s = copy.deepcopy(get_settings(client))
    s["workingDays"] = 6
    s["maxPairsPerDayGroup"] = 5
    s["timeFormat"] = "12h"
    s["formMaxPairs"]["full"] = 5
    s["slots"] = s["slots"][:6]  # nothing uses the 7th pair yet
    assert client.put("/api/settings", json=s, headers=admin).status_code == 422  # but year shifts still point at it
    s["yearShifts"] = [{"first": 0, "last": 3}, {"first": 1, "last": 4}] + [{"first": 3, "last": 5}] * 4
    s["masterYearShifts"] = [{"first": 4, "last": 5}] * 2
    s["evaluation"]["vacations"] = [{"name": "Zi liberă", "start": "2026-11-02", "end": "2026-11-02"}]
    s["evaluation"]["holidayOverrides"] = {"2026:winter": {"start": "2026-12-24", "end": "2027-01-10"}, "2027:labour": None}
    s["evaluation"]["midtermStartTimes"] = ["15:15", "17:00"]
    s["masterEvaluation"]["examFrom"] = "17:00"
    s["groupPeriods"] = [{"id": "x", "kind": "internship", "start": "2027-03-01", "end": "2027-03-28", "groupIds": [w.g1["id"], w.g2["id"]]}]
    r = client.put("/api/settings", json=s, headers=admin)
    assert r.status_code == 200, r.text
    out = get_settings(client)
    assert out["workingDays"] == 6 and out["formMaxPairs"]["full"] == 5 and out["timeFormat"] == "12h" and len(out["slots"]) == 6
    assert out["evaluation"]["vacations"] == s["evaluation"]["vacations"]
    assert out["evaluation"]["holidayOverrides"] == s["evaluation"]["holidayOverrides"]
    assert out["evaluation"]["midtermStartTimes"] == ["15:15", "17:00"]
    # master's follows licență except what it overrides
    assert out["masterEvaluation"]["examFrom"] == "17:00" and "midtermStartTimes" not in out["masterEvaluation"]
    gp = out["groupPeriods"][0]
    assert gp["kind"] == "internship" and gp["groupIds"] == [w.g1["id"], w.g2["id"]]


def test_master_calendar_follows_licenta(client, admin):
    s = copy.deepcopy(get_settings(client))
    s["evaluation"]["examMinutes"] = 120  # master's does not override it, so it follows
    out = client.put("/api/settings", json=s, headers=admin).json()
    assert "examMinutes" not in out["masterEvaluation"]
    s["masterEvaluation"] = None
    assert "masterEvaluation" not in client.put("/api/settings", json=s, headers=admin).json()


def test_new_semester_becomes_current(client, db, admin):
    s = copy.deepcopy(get_settings(client))
    s["semester"] = "Primăvara 2026/2027"
    out = client.put("/api/settings", json=s, headers=admin).json()
    assert out["semester"] == "Primăvara 2026/2027"
    rows = db.execute("select label, season, is_current from semester order by id").fetchall()
    assert rows == [("Toamna 2026/2027", "autumn", False), ("Primăvara 2026/2027", "spring", True)]
    s["semester"] = "nonsense"
    assert client.put("/api/settings", json=s, headers=admin).status_code == 422


def test_bad_settings_are_rejected(client, admin):
    s = copy.deepcopy(get_settings(client))
    s["workingDays"] = 9
    assert client.put("/api/settings", json=s, headers=admin).status_code == 422
    s = copy.deepcopy(get_settings(client))
    s["evaluation"]["semesterStart"] = "2026-09-01"  # a Tuesday
    assert client.put("/api/settings", json=s, headers=admin).status_code == 422
    s = copy.deepcopy(get_settings(client))
    del s["lessonMinutes"]
    assert client.put("/api/settings", json=s, headers=admin).status_code == 422
    # a failed save leaves the old settings untouched
    assert get_settings(client)["workingDays"] == 7


def test_pair_times_in_use_cannot_be_dropped(client, admin):
    w = World(client, admin)
    a = w.seminar(w.s1, w.t1, w.g1)
    tt = {"name": "T", "status": "draft", "groupIds": [w.g1["id"]], "algorithm": "", "lessons": [{"id": "L1", "assignmentId": a["id"], "day": 0, "slot": 6, "roomId": w.r1["id"], "parity": "weekly"}]}
    assert client.put("/api/timetables/new", json=tt, headers=admin).status_code == 200
    s = copy.deepcopy(get_settings(client))
    s["slots"] = s["slots"][:6]
    s["yearShifts"] = [{"first": 0, "last": 3}] * 6
    s["masterYearShifts"] = [{"first": 4, "last": 5}] * 2
    r = client.put("/api/settings", json=s, headers=admin)
    assert r.status_code == 409
    assert len(get_settings(client)["slots"]) == 7
