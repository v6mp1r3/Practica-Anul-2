# EduSchool

Automated university timetabling — internship project, Team 1, FAF-251 (UTM).

EduSchool helps a dean's office build a conflict-free timetable (groups, streams,
subgroups, odd/even weeks), lets teachers see their load and submit availability,
and gives students one place to see the institution's timetable, free rooms and
teacher availability.

## Repository layout

| Folder      | What lives there                         | Owner     |
|-------------|------------------------------------------|-----------|
| `frontend/` | React + TypeScript web client            | frontend  |
| `backend/`  | REST API + CP-SAT / LNS solver (planned) | backend   |
| `docs/`     | Shared docs: API contract, diagrams      | everyone  |

Each part lives in its own folder so people can work in parallel without touching
each other's files. See [CONTRIBUTING.md](CONTRIBUTING.md) before your first push.
