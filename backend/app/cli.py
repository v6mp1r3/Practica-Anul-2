"""Accounts are created on the server, there is no accounts page (docs/API.md, Roles).

  python -m app.cli create-admin --username elena.popescu --name "Elena Popescu" --faculty FCIM
  python -m app.cli set-password --username elena.popescu
"""
import argparse
import getpass
import sys

from sqlalchemy import text

from .db import get_engine
from .errors import ApiError
from .security import check_new_password, hash_password


def _ask_password(given: str | None) -> str:
    if given:
        return given
    first = getpass.getpass("Password (at least 8 characters): ")
    if first != getpass.getpass("Repeat password: "):
        sys.exit("The passwords do not match.")
    return first


def _check(password: str) -> None:
    try:
        check_new_password(password)
    except ApiError as e:
        sys.exit(str(e.detail))


def create_admin(username: str, name: str, faculty_code: str, email: str | None, password: str | None) -> None:
    pw = _ask_password(password)
    _check(pw)
    with get_engine().begin() as conn:
        fid = conn.execute(text("select id from faculty where code = :c"), {"c": faculty_code.upper()}).scalar()
        if fid is None:
            codes = ", ".join(r[0] for r in conn.execute(text("select code from faculty order by id")))
            sys.exit(f"Unknown faculty code {faculty_code!r}. Choose one of: {codes}")
        try:
            conn.execute(
                text("insert into app_user (username, password_hash, name, role, faculty_id, email) values (:u, :h, :n, 'admin', :f, :e)"),
                {"u": username.strip().lower(), "h": hash_password(pw), "n": name, "f": fid, "e": email},
            )
        except Exception as exc:  # unique username or email
            sys.exit(f"Could not create the account: {exc.__class__.__name__}. Is the username or email already used?")
    print(f"Created admin {username.strip().lower()} for {faculty_code.upper()}.")


def set_password(username: str, password: str | None) -> None:
    pw = _ask_password(password)
    _check(pw)
    with get_engine().begin() as conn:
        n = conn.execute(text("update app_user set password_hash = :h where lower(username) = :u"), {"h": hash_password(pw), "u": username.strip().lower()}).rowcount
    if not n:
        sys.exit(f"No account with username {username!r}.")
    print("Password changed.")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="python -m app.cli")
    sub = p.add_subparsers(dest="command", required=True)
    c = sub.add_parser("create-admin", help="create a faculty administrator")
    c.add_argument("--username", required=True)
    c.add_argument("--name", required=True)
    c.add_argument("--faculty", required=True, help="faculty code, e.g. FCIM")
    c.add_argument("--email")
    c.add_argument("--password", help="only for scripts; leave out to be asked")
    s = sub.add_parser("set-password", help="set a new password for an account")
    s.add_argument("--username", required=True)
    s.add_argument("--password", help="only for scripts; leave out to be asked")
    args = p.parse_args(argv)
    if args.command == "create-admin":
        create_admin(args.username, args.name, args.faculty, args.email, args.password)
    else:
        set_password(args.username, args.password)


if __name__ == "__main__":
    main()
