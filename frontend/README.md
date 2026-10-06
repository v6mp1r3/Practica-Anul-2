# EduSchedule — frontend

React 18 + TypeScript + Vite. No UI framework; styles are plain CSS with design
tokens in `src/styles/tokens.css` (EduSchedule brand palette, light and dark themes).
Font: Inter.

## Run it

```bash
cd frontend
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:5173
```

Only the administration signs in — one or more accounts per faculty. Students and
teachers use the public pages without an account: **Orar studenți** (`/studenti`, any group), **Orar profesori** (`/profesori`, any
teacher), **Săli libere** (`/rooms`) and **Profesori disponibili** (`/teachers`).

Demo administrator accounts (password `demo`), shown on the login page in mock mode:

| User            | Faculty |
| --------------- | ------- |
| `elena.popescu` | FCIM    |
| `ion.sirbu`     | FET     |

The landing page is at `/`; administrators sign in at `/login`.

Suggested first run: log in as Elena → **Generare** → _Generează_ → keep a variant →
**Publică**. Then open `/studenti` or `/profesori` (no sign-in) and pick a group or a teacher.

## Scripts

| Command                | What it does                               |
| ---------------------- | ------------------------------------------ |
| `npm run dev`          | dev server with hot reload                 |
| `npm run build`        | type-check + production build into `dist/` |
| `npm test`             | unit tests (Vitest)                        |
| `npm run typecheck`    | TypeScript only                            |
| `npm run format`       | format everything with Prettier            |
| `npm run format:check` | what CI runs                               |

## Backend connection

`VITE_API_MODE=mock` (default) keeps all data in `localStorage`, so the UI works
without a server. With `VITE_API_MODE=http` the client calls the REST API described
in [`docs/API.md`](../docs/API.md); in development `/api` is proxied to
`VITE_API_PROXY` (default `http://localhost:8000`).

In mock mode, _Configurare → Resetează datele demo_ restores the demo dataset.

## Where things are

```
src/
  api/          API contract (types.ts), REST client (http.ts), in-browser mock (mock.ts)
  domain/       pure logic, no React — unit tested
    types.ts      data model (matches docs/API.md)
    validator.ts  hard constraints: clashes, capacity, room type, availability, hours
    score.ts      soft constraints → weighted penalty, pre-publish warnings
    precheck.ts   data checks before generation (rooms, load, study plan)
    generator.ts  greedy construction + Large Neighborhood Search (mock solver)
    views.ts      filters by group/teacher/room, week parity helpers
    csv.ts        study plan import
  components/   shared UI: TimetableGrid, CrudPage, AvailabilityPicker, Logo…
  pages/
    admin/      dashboard, setup, data pages, generate, timetables, editor
    public/     student timetable (any group) and teacher timetable (any teacher), no sign-in
    shared/     free rooms and teacher availability (public), institution timetable, notifications
    landing/    public one-page site (copy.ts holds the RO/EN/RU text)
  i18n/         ro.ts (default), en.ts, ru.ts — every visible string lives here
  state/        auth, cached server data, toasts
  styles/       tokens, base, components, layout, timetable
```

## Conventions

- Every visible string goes through `t('key')`; add the key to `ro.ts`, `en.ts` and
  `ru.ts` (TypeScript fails the build if a translation is missing a key).
- Domain logic stays in `src/domain` without React, with a `*.test.ts` next to it.
- Run `npm run format` before committing.

## Logo

`src/components/Logo.tsx` holds the EduSchedule logo as inline SVG ("Edu" follows the
text colour, so it works in dark mode). Source files and PNG exports are in
[`docs/brand/`](../docs/brand/).

## Deploying

`npm run build` produces static files in `dist/`. The app uses client-side routing,
so the web server must serve `index.html` for unknown paths (e.g. nginx
`try_files $uri /index.html;`).
