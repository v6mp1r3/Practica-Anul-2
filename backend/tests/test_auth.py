import pytest

pytestmark = []


def test_login_me_logout(client, admin):
    r = client.post("/api/auth/login", json={"username": "ELENA", "password": "secret-pass-1"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["username"] == "elena" and body["user"]["role"] == "admin"
    assert body["user"]["faculty"].startswith("Facultatea Calculatoare")
    h = {"Authorization": f"Bearer {body['token']}"}
    assert client.get("/api/auth/me", headers=h).json()["name"] == "Elena Popescu"
    assert client.post("/api/auth/logout", headers=h).status_code == 204


def test_bad_credentials_and_missing_token(client, admin):
    r = client.post("/api/auth/login", json={"username": "elena", "password": "nope"})
    assert r.status_code == 401 and r.json() == {"message": "Invalid credentials"}
    assert client.post("/api/auth/login", json={"username": "ghost", "password": "x"}).status_code == 401
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
    assert client.get("/api/teachers").status_code == 401


def test_account_without_a_password_cannot_log_in(client, db):
    db.execute("alter table app_user add column if not exists auth_user_id uuid")
    db.execute("alter table app_user alter column password_hash drop not null")
    db.execute("insert into app_user (username, name, role, faculty_id) select 'linked', 'Linked', 'admin', id from faculty where code = 'FCIM'")
    for pw in ("", "anything", "secret-pass-1"):
        assert client.post("/api/auth/login", json={"username": "linked", "password": pw}).status_code == 401


def test_change_password(client, admin):
    r = client.post("/api/auth/password", json={"current": "wrong", "next": "new-secret-1"}, headers=admin)
    assert r.status_code == 400
    r = client.post("/api/auth/password", json={"current": "secret-pass-1", "next": "short"}, headers=admin)
    assert r.status_code == 422
    assert client.post("/api/auth/password", json={"current": "secret-pass-1", "next": "new-secret-1"}, headers=admin).status_code == 204
    assert client.post("/api/auth/login", json={"username": "elena", "password": "secret-pass-1"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "elena", "password": "new-secret-1"}).status_code == 200


def test_update_profile(client, admin):
    r = client.put("/api/auth/me", json={"name": "  Elena P.  ", "email": "elena@utm.example", "phone": "060000000", "emailNotifications": True}, headers=admin)
    assert r.status_code == 200
    me = r.json()
    assert me["name"] == "Elena P." and me["email"] == "elena@utm.example" and me["emailNotifications"] is True
    assert client.put("/api/auth/me", json={"name": " "}, headers=admin).status_code == 422
    # faculty must be one of the 14
    assert client.put("/api/auth/me", json={"name": "E", "faculty": "Facultatea Inexistenta"}, headers=admin).status_code == 422
    fet = "Facultatea Electronică și Telecomunicații"
    assert client.put("/api/auth/me", json={"name": "E", "faculty": fet}, headers=admin).json()["faculty"] == fet
    # avatar can be set and cleared
    assert client.put("/api/auth/me", json={"name": "E", "avatar": "data:image/png;base64,AA"}, headers=admin).json()["avatar"].startswith("data:")
    assert "avatar" not in client.put("/api/auth/me", json={"name": "E", "avatar": None}, headers=admin).json()


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_too_many_failed_sign_ins_lock_the_account_for_a_while(client, admin):
    login = lambda pw, user="elena": client.post("/api/auth/login", json={"username": user, "password": pw})
    for _ in range(8):
        assert login("wrong").status_code == 401
    r = login("secret-pass-1")  # even the right password is refused now
    assert r.status_code == 429 and "Too many" in r.json()["message"]
    # other accounts, and unknown names that were never tried, are not affected
    assert login("x", "somebody-else").status_code == 401
    # a unknown account is limited the same way (the answer must not reveal which names exist)
    for _ in range(8):
        login("x", "ghost")
    assert login("x", "ghost").status_code == 429


def test_a_good_sign_in_clears_the_count(client, admin):
    login = lambda pw: client.post("/api/auth/login", json={"username": "elena", "password": pw})
    for _ in range(7):
        assert login("wrong").status_code == 401
    assert login("secret-pass-1").status_code == 200
    for _ in range(7):
        assert login("wrong").status_code == 401
    assert login("secret-pass-1").status_code == 200
