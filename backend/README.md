# EduSchedule backend

REST API for the EduSchedule web client: FastAPI + SQLAlchemy on PostgreSQL (Supabase). It implements
[`docs/API.md`](../docs/API.md) — every endpoint except timetable generation, which waits for the CP-SAT solver.

```
backend/
  app/            the API (routers → services → repo/SQL)
    domain/       Python port of the frontend's validator and score (checked against the TypeScript)
  db/             schema.sql, seed.sql, smoke_test.sql, supabase_setup.sql, migrations/
  tests/          pytest suite (needs a PostgreSQL)
```

## Run it

You need Python 3.12 and a PostgreSQL database that already has the schema (see `db/`).

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # then fill in DATABASE_URL and JWT_SECRET
.venv/bin/python -m app.cli create-admin --username elena.popescu --name "Elena Popescu" --faculty FCIM
.venv/bin/uvicorn app.main:app --reload --port 8000
```

- API: `http://localhost:8000/api` · interactive docs: `http://localhost:8000/api/docs`
- Always start it from the `backend` folder (that is where `.env` is read).
- Use the frontend against it: in `frontend/.env` set `VITE_API_MODE=http`. Vite already forwards `/api` to port 8000.

### Database

`DATABASE_URL` is the connection string. On Supabase use **Connect → Session pooler** (the direct host is IPv6
only). Plain `postgresql://…` is fine, the app adds the driver. Both the session pooler (5432) and the
transaction pooler (6543) work.

To create the tables, paste `db/supabase_setup.sql` into the Supabase SQL Editor (or run
`psql "$DATABASE_URL" -f db/schema.sql -f db/seed.sql`). If you created them earlier, also run the files
in `db/migrations/` you have not run yet, in order:

| File | What it does |
| --- | --- |
| `001_supabase_admin.sql` | Supabase only: links `app_user` to a Supabase Auth user. **Not needed by this backend** (it has its own login). |
| `002_group_periods.sql` | Adds the group-period tables (internships, licence exams, …). **Needed.** |
| `003_allow_draft_room_clashes.sql` | Drops a rule that stopped drafts with room clashes from being saved. **Needed.** |

The backend connects with the database password and bypasses row-level security; every table has RLS on with no
policies, so Supabase's own public API can read nothing.

### Accounts

There is no accounts page: administrators are created on the server. Each belongs to one faculty
(`FCIM`, `FET`, … see the `faculty` table) and changes only that faculty's groups, subjects, teachers and rooms.

```bash
.venv/bin/python -m app.cli create-admin --username ion.sirbu --name "Ion Sirbu" --faculty FET   # asks for a password
.venv/bin/python -m app.cli set-password --username ion.sirbu
```

Passwords are 8–72 bytes and stored as bcrypt hashes. Login returns a JWT (valid `JWT_EXPIRE_HOURS`, default 12)
that the client sends as `Authorization: Bearer …`.

## Tests

```bash
createdb eduschedule_test      # an empty, throwaway database; its public schema is rebuilt for every test
TEST_DATABASE_URL=postgresql://localhost/eduschedule_test .venv/bin/pytest
```

Without `TEST_DATABASE_URL` only the tests that need no database run. `tests/test_parity.py` checks that the
scoring and clash detection in `app/domain` give exactly the numbers of the frontend's TypeScript on the demo
data. If you change `frontend/src/domain/score.ts` or `validator.ts`, change the port too and refresh the
fixture (`tests/fixtures/make_parity.ts` explains how).

## What works, what does not

| Area | Status |
| --- | --- |
| Login, profile, password | done |
| Dataset, settings (calendar, shifts, slots, group periods, semesters) | done |
| Teachers, rooms, groups, streams, subjects, assignments (CRUD, subject import, availability) | done |
| Automatic and predefined streams, group language | done |
| Timetables: save with server-side score, publish (merges faculties, refuses clashes), withdraw | done |
| Schedule changes (checks the room or substitute is free) and notifications | done |
| Exam timetables: save, publish, withdraw | done |
| `POST /generate`, `POST /exams/plans/{round}/generate` | **`501`** until the solver is written |

## Things to know

- **Public reads.** `GET /dataset`, `/timetables/published`, `/changes` and `/exams` need no login, as the
  contract says, so they include teachers' emails.
- **No login throttling and no token revocation** yet. Logging out only makes the client forget its token.
- **Settings belong to a semester.** `PUT /settings` with a new `semester` label (`Toamna 2027/2028`) starts a new
  semester and makes it current; timetables, exam plans and the calendar are per semester.
- **Pair times are shared** by all semesters. Removing a pair time that a timetable or an availability still uses
  is refused (`409`).
- **Queries are plain SQL** (SQLAlchemy Core `text()`), so the `.sql` files are the only description of the schema.
