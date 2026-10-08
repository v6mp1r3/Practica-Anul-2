# EduSchedule backend

REST API for the EduSchedule web client: FastAPI + SQLAlchemy on PostgreSQL (Supabase). It implements
[`docs/API.md`](../docs/API.md) — every endpoint, including timetable and exam generation.

```
backend/
  app/            the API (routers → services → repo/SQL)
    domain/       Python port of the frontend's validator and score (checked against the TypeScript)
    solver/       timetable generation (CP-SAT model, LNS, greedy start, reduced-attendance sessions)
                  and exam generation (exams.py)
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
| `005_subject_language.sql` | Adds French and gives every subject a language of instruction (AM in Russian is separate from AM in Romanian). **Needed.** |

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
| Timetable generation (`POST /generate`, polled with `GET /generate/{id}`): CP-SAT + LNS | done |
| Exam and atestări generation (`POST /exams/plans/{round}/generate`) | done |

## How generation works

`POST /generate` saves a job and a worker thread solves it while the client polls (report, section 2.2.2).
For each variant (`app/solver/generate.py`):

1. A fast greedy heuristic places every pair, so there is always a complete timetable to start from.
2. **CP-SAT** (Algorithm 1) solves the whole weekly timetable starting from it. One Boolean per teaching load, day,
   pair and room; teachers, rooms and groups (and subgroups) are in one place at a time, per odd and even week;
   every load gets all its pairs; locked pairs and other faculties' published pairs stay put. The objective is the
   weighted soft penalties of `frontend/src/domain/score.ts` (gaps, overload, uneven days, preferences…); a test
   checks that the objective equals the real score.
3. **Large Neighborhood Search** (Algorithm 2) keeps improving it until the time is up: free some pairs (random,
   by day, by teacher or by group), let CP-SAT place them again, keep the result if it is not worse, free more
   when nothing improves.
4. Reduced-attendance groups get their dated session pairs last.

Time per variant is `iterations x GENERATION_SECONDS_PER_ITERATION` (default 0.1 s), between
`GENERATION_MIN_SECONDS` and `GENERATION_MAX_SECONDS`. `SOLVER_WORKERS` sets the CPU cores (default: up to 8).
Only one job runs at a time; a restart marks unfinished jobs as failed. With contradictory data (not enough
rooms, a teacher never free) the answer lists what is missing instead of failing: those pairs show up as
`hours-missing` in the score.

## How exam generation works

`POST /exams/plans/{round}/generate` (`app/solver/exams.py`) is a rule-for-rule port of the frontend's
`generateExams` and `generateMidterms`, with the same seeded random generator, so a seed gives the same plan as
the frontend's mock (`tests/test_exam_parity.py` replays runs recorded from the TypeScript). The rules:
one exam a day per group and at least `examMinGap` free days between them; the examiner is the lecturer; the room
is where the subject is taught, else the smallest that fits; a consultation the day before (or just before the
exam after a holiday or when the settings say so); teachers' exam-period availability and holidays are respected;
other faculties' published events and the faculty's other rounds stay booked. Atestări 1 and 2 are placed in the
subject's own classes of the published timetable (or after classes if the settings say `separate`), their retakes
after classes, and a group on internship gets its own atestare weeks. The result is a new draft that replaces the
old plan; the response also says how many exams did not fit (`warnings`). `{"seed": n}` repeats a run.

## Things to know

- **Public reads.** `GET /dataset`, `/timetables/published`, `/changes` and `/exams` need no login, as the
  contract says, so they include teachers' emails.
- **Sign-in is limited:** 8 failed attempts for one account in 10 minutes lock it for a while (`429`), counted in
  the memory of one server process. Tokens are not revoked: logging out only makes the client forget its token,
  and a token stays valid until it expires (12 h) even after a password change.
- **Settings belong to a semester.** `PUT /settings` with a new `semester` label (`Toamna 2027/2028`) starts a new
  semester and makes it current; timetables, exam plans and the calendar are per semester.
- **Pair times are shared** by all semesters. Removing a pair time that a timetable or an availability still uses
  is refused (`409`).
- **Queries are plain SQL** (SQLAlchemy Core `text()`), so the `.sql` files are the only description of the schema.
