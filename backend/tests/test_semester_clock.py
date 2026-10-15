"""The current semester follows the calendar: spring from the winter break, autumn from the summer break."""
import datetime as dt

import pytest

from app.semester_clock import advance, due_semester, winter_break_start

D = dt.date


@pytest.mark.no_db
def test_the_due_semester_by_date():
    assert winter_break_start(2026, {}) == D(2026, 12, 28)  # 28 December 2026 is a Monday
    assert winter_break_start(2027, {}) == D(2027, 12, 27)  # the Monday of the week of 28 December
    assert due_semester(D(2026, 10, 13)) == "Toamna 2026/2027"
    assert due_semester(D(2026, 12, 27)) == "Toamna 2026/2027"
    assert due_semester(D(2026, 12, 28)) == "Primăvara 2026/2027"  # the winter break: time to build spring's timetable
    assert due_semester(D(2027, 3, 1)) == "Primăvara 2026/2027"
    assert due_semester(D(2027, 6, 30)) == "Primăvara 2026/2027"
    assert due_semester(D(2027, 7, 1)) == "Toamna 2027/2028"  # the summer break: next autumn's
    # a winter break moved by the administration moves the switch with it
    assert due_semester(D(2026, 12, 21), {"2026:winter": {"start": "2026-12-21"}}) == "Primăvara 2026/2027"
    assert due_semester(D(2026, 12, 28), {"2026:winter": None}) == "Primăvara 2026/2027"  # hidden: the usual date


def test_advance_switches_forward_only_and_keeps_the_settings(client, db, admin):
    before = client.get("/api/dataset").json()["settings"]
    assert advance(D(2026, 11, 2)) is None  # still autumn
    assert advance(D(2026, 12, 28)) == "Primăvara 2026/2027"
    after = client.get("/api/dataset").json()["settings"]
    assert after["semester"] == "Primăvara 2026/2027" and after["workingDays"] == before["workingDays"] and after["slots"] == before["slots"]
    rows = db.execute("select label, is_current from semester order by id").fetchall()
    assert rows == [("Toamna 2026/2027", False), ("Primăvara 2026/2027", True)]
    assert advance(D(2026, 12, 30)) is None  # already there
    assert advance(D(2026, 10, 1)) is None  # never back
