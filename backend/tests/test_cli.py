import pytest

from app import cli


def login(client, username, password):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_create_admin_then_log_in(client, db):
    cli.create_admin("  New.Dean ", "New Dean", "fcim", "dean@utm.example", "long-enough-1")
    r = login(client, "new.dean", "long-enough-1")
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin" and r.json()["user"]["email"] == "dean@utm.example"
    assert r.json()["user"]["faculty"].startswith("Facultatea Calculatoare")


def test_create_admin_rejects_bad_input(client, db, capsys):
    with pytest.raises(SystemExit) as e:
        cli.create_admin("x", "X", "NOPE", None, "long-enough-1")
    assert "Unknown faculty" in str(e.value)
    with pytest.raises(SystemExit) as e:
        cli.create_admin("x", "X", "FCIM", None, "short")
    assert "too short" in str(e.value)
    with pytest.raises(SystemExit) as e:
        cli.create_admin("x", "X", "FCIM", None, "p" * 80)
    assert "too long" in str(e.value)
    cli.create_admin("dup", "Dup", "FCIM", None, "long-enough-1")
    with pytest.raises(SystemExit) as e:
        cli.create_admin("dup", "Dup", "FCIM", None, "long-enough-1")
    assert "already used" in str(e.value)


def test_set_password(client, db):
    cli.create_admin("dean", "Dean", "FET", None, "first-pass-1")
    cli.set_password("DEAN", "second-pass-2")
    assert login(client, "dean", "first-pass-1").status_code == 401
    assert login(client, "dean", "second-pass-2").status_code == 200
    with pytest.raises(SystemExit):
        cli.set_password("ghost", "second-pass-2")


def test_a_long_password_is_refused_over_the_api_too(client, admin):
    r = client.post("/api/auth/password", json={"current": "secret-pass-1", "next": "p" * 80}, headers=admin)
    assert r.status_code == 422 and "too long" in r.json()["message"]
    assert client.post("/api/auth/login", json={"username": "elena", "password": "secret-pass-1"}).status_code == 200
