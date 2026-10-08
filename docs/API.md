# EduSchedule REST API contract

The frontend talks to the backend only through the endpoints below. The TypeScript
source of truth is [`frontend/src/api/types.ts`](../frontend/src/api/types.ts) and
[`frontend/src/domain/types.ts`](../frontend/src/domain/types.ts) — field names here
match those files. **If you change an endpoint, change this file and those types in
the same pull request.**

- Base URL: `/api` (configurable with `VITE_API_URL`)
- Format: JSON, UTF-8. Dates are ISO 8601 strings.
- Auth: `Authorization: Bearer <token>` on every request except login.
- Errors: non-2xx status with body `{ "message": "human readable text" }`.
  `401` = not signed in, `403` = wrong role or someone else's faculty, `404` = not found,
  `409` = conflict (a publish that clashes, deleting something still in use),
  `422` = invalid data, `429` = too many failed sign-ins for an account (8 in 10 minutes).
- Ids are opaque strings. The real backend uses numbers (`"17"`); the mock uses `"t1"`.
  Always use the id a response gives you, never invent one: `PUT /timetables/{id}` with an
  unknown id creates a timetable and the response carries its real id.

Until the backend exists the frontend runs with `VITE_API_MODE=mock`, which
implements this exact contract in the browser (`frontend/src/api/mock.ts`). It is the
reference behaviour when something here is unclear.

## Roles

Only the administration has accounts (`role: "admin"`). Students and teachers
don't sign in: the reads they need are **public** (no token) —
`GET /dataset`, `GET /timetables/published` and `GET /changes`. Everything else
needs an admin token.

Every `admin` account belongs to one faculty (`User.faculty`); there is no
administrator above the faculties and no accounts page in the app — accounts are
created on the server. An admin sees and changes only their own faculty's groups,
subjects, teachers and rooms; another faculty's teacher or room shows up
(read-only) only when it teaches or hosts this faculty's classes. Generation,
publishing and unpublishing are per faculty. Settings (`PUT /settings`) are shared.
Every group has a `faculty`.

EduSchedule is for UTM only: `Settings.institutionName` is fixed and
`Settings.faculties` is UTM's 14 faculties. An admin picks their own faculty in
Configurare, which sends `faculty` in `PUT /auth/me` (it must be one of
`Settings.faculties`).

## Auth

| Method | Path           | Body                     | Response          |
| ------ | -------------- | ------------------------ | ----------------- |
| POST   | `/auth/login`  | `{ username, password }` | `{ token, user }` |
| GET    | `/auth/me`     | —                        | `User`            |
| POST   | `/auth/logout` | —                        | `204`             |
| PUT    | `/auth/me`     | `ProfileUpdate`          | `User`            |
| POST   | `/auth/password` | `{ current, next }`    | `204` (`400` wrong current password, `422` shorter than 8 or longer than 72 bytes) |

Accounts are created on the server with `python -m app.cli create-admin` (see
`backend/README.md`); there is no endpoint for it.

```json
// User
{
  "id": "u2",
  "username": "daniel.rusu",
  "name": "Daniel Rusu",
  "role": "teacher",
  "teacherId": "t1"
}
```

`teacherId` is set for teachers, `groupId` for students.

## Dataset and settings

| Method | Path        | Role  | Response / body                                     |
| ------ | ----------- | ----- | --------------------------------------------------- |
| GET    | `/dataset`  | any   | `Dataset` — everything the solver needs in one call |
| PUT    | `/settings` | admin | body and response: `Settings`                       |

```json
// Dataset
{ "settings": Settings, "teachers": [], "rooms": [], "groups": [], "streams": [], "subjects": [], "assignments": [] }

// Settings
{
  "institutionName": "Universitatea Tehnică a Moldovei",
  "faculties": ["Facultatea Calculatoare, Informatică și Microelectronică", "Facultatea Electronică și Telecomunicații"],
  "semester": "Toamna 2026/2027",
  "workingDays": 5,
  "lessonMinutes": 90,
  "slots": [{ "start": "08:00", "end": "09:30" }],
  "weekParity": true,
  "maxPairsPerDayGroup": 4,
  "minPairsPerDayGroup": 2,
  "maxPairsPerDayTeacher": 5,
  "consultationRequired": true
}
```

## Collections (CRUD)

Same shape for `teachers`, `rooms`, `groups`, `streams`, `subjects`, `assignments`:

| Method | Path                 | Role  | Body / response                  |
| ------ | -------------------- | ----- | -------------------------------- |
| GET    | `/{collection}`      | any   | array of items                   |
| POST   | `/{collection}`      | admin | item without `id` → created item |
| PUT    | `/{collection}/{id}` | admin | full item → saved item           |
| DELETE | `/{collection}/{id}` | admin | `204`                            |

Deleting a teacher, subject, group or stream also deletes the assignments that
reference it. Deleting something an exam timetable or a schedule change still uses
(a room, or a teacher or subject with exam events) is refused with `409`.

**Streams.** A stream is the set of groups that attend one lecture together. There are
two kinds:

- *automatic*: made from the lecture itself. Different subjects have different streams
  (AM: TI-261, TI-262, IA-261, IA-262; PC: TI-261, TI-262, SI-261, SI-262). To get one,
  send the groups instead of a stream id when creating the lecture's assignment:
  `"audience": { "kind": "stream", "groupIds": ["g1", "g2"] }`. The server finds the stream
  of that subject for exactly those groups, or creates it, and answers with
  `"audience": { "kind": "stream", "id": "…" }`. At least 2 groups; an automatic stream
  cannot be used for another subject.
- *predefined*: made with `POST /streams` (a name and at least 2 `groupIds`), like FAF,
  and used by any subject with `"audience": { "kind": "stream", "id": "…" }`.

`GET /streams` lists both kinds.

An administrator changes only their own faculty's records (`403` otherwise). A teacher, room
or subject without a `faculty` is shared and any administrator may change it.

```json
// Teacher — slot keys are "day:slot", day 0 = Monday, slot 0 = first pair
{ "id": "t1", "name": "Daniel Rusu", "title": "lect. univ.", "department": "Ingineria Software",
  "email": "daniel.rusu@fcim.example.md", "maxPairsPerWeek": 12,
  "activityTypes": ["lecture", "seminar", "lab"],
  "unavailable": ["4:4", "4:5"], "preferred": ["1:1"], "consultation": "2:3" }

// Room
{ "id": "r8", "name": "3-404", "building": "Blocul 3", "capacity": 16, "type": "lab", "equipment": ["calculatoare"] }

// Group — `language` is the language of instruction: "ro" (default), "ru", "en" or "fr"
{ "id": "g1", "name": "FAF-251", "program": "Ingineria Software", "faculty": "Facultatea Calculatoare, Informatică și Microelectronică", "year": 1, "size": 24, "subgroups": 2, "language": "ro" }

// Stream (groups that attend a lecture together)
{ "id": "s1", "name": "FAF-25", "groupIds": ["g1", "g2"], "subjectId": null }
// subjectId: the subject an automatic stream belongs to; null for a predefined stream

// Subject — pairs per week from the study plan; 0.5 = every other week.
// `language` ("ro" default, "ru", "en", "fr"): the groups it is for; AM in "ru" is a separate subject from AM in "ro"
{ "id": "sub1", "code": "AM", "name": "Analiză matematică", "credits": 6, "year": 1,
  "lecturePairs": 2, "seminarPairs": 1, "labPairs": 0, "language": "ro" }

// Assignment (teaching load). audience.kind is "stream" | "group" | "subgroup"
{ "id": "a1", "subjectId": "sub1", "type": "lecture", "teacherId": "t3",
  "audience": { "kind": "stream", "id": "s3" },
  "pairsPerWeek": 2, "parity": "weekly", "roomType": "lecture", "equipment": [] }
```

Activity types are `lecture`, `seminar`, `lab` and `project`. A project is held in an ordinary room
(`roomType: "seminar"`) and has no pairs in the study plan, so it is not compared with it. A teacher's
`maxPairsPerWeek` is the planned load in pairs and may have halves (`4.5`): a pair held every other week
counts 0.5.

Extra endpoints:

| Method | Path                          | Role                | Body                                                    |
| ------ | ----------------------------- | ------------------- | ------------------------------------------------------- |
| POST   | `/subjects/import`            | admin               | `{ subjects: Subject[] without id }` → created subjects |
| PUT    | `/teachers/{id}/availability` | admin, that teacher | `{ unavailable, preferred, consultation? }` → `Teacher` |

## Timetables

| Method | Path                         | Role  | Notes                                                                                                                                                                                                                     |
| ------ | ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/timetables`                | admin | all drafts, variants and the published one                                                                                                                                                                                |
| GET    | `/timetables/published`      | any   | the published timetable, or `null`                                                                                                                                                                                        |
| GET    | `/timetables/{id}`           | any   |                                                                                                                                                                                                                           |
| PUT    | `/timetables/{id}`           | admin | create or update; a `variant` becomes a `draft`; server recomputes `score`                                                                                                                                                |
| DELETE | `/timetables/{id}`           | admin |                                                                                                                                                                                                                           |
| POST   | `/timetables/{id}/publish`   | admin | previous published one becomes `draft`; creates a notification for everyone                                                                                                                                               |
| POST   | `/timetables/{id}/unpublish` | admin | withdraws it (back to `draft`); a faculty admin withdraws only their faculty's groups — those pairs come back as a new `draft`, the rest stays published. 409 if not published. Notifies the affected groups and teachers |

```json
// Timetable
{
  "id": "tt1",
  "name": "Varianta A",
  "status": "draft",
  "createdAt": "2026-10-02T10:00:00.000Z",
  "updatedAt": "2026-10-02T10:05:00.000Z",
  "algorithm": "CP-SAT + LNS (seed 42, 60 s)",
  "groupIds": ["g1", "g2"],
  "lessons": [
    {
      "id": "L1",
      "assignmentId": "a1",
      "day": 0,
      "slot": 1,
      "roomId": "r1",
      "parity": "weekly",
      "locked": false
    }
  ],
  "score": {
    "hard": 0,
    "soft": 42.4,
    "breakdown": {
      "teacherGaps": 0.5,
      "groupGaps": 0.5,
      "earlyStarts": 0,
      "dayOverload": 0,
      "unevenDays": 34.4,
      "preferenceMisses": 4.5
    }
  }
}
```

`status` is `variant` (fresh from the generator), `draft` or `published`.

## Generation (background job)

Generation can take minutes, so it is a job the client polls.

> **Status.** Everything on this page works. Timetable generation runs CP-SAT with Large Neighborhood Search
> (`backend/app/solver`): each variant gets `iterations` x 0.1 s (so 80 / 250 / 700 iterations are 8 / 25 / 70
> seconds), at least 5 s and at most 300 s, and the variants run one after the other. `POST /generate` answers
> `202`. Reduced-attendance groups get their dated session pairs from a greedy pass after the weekly solve.

```
POST /generate            (admin)
{ "groupIds": ["g1","g2"], "variants": 3, "iterations": 250, "seed": 42, "baseTimetableId": "tt1" }
→ { "jobId": "job_123" }

GET /generate/{jobId}
→ { "status": "running" | "done" | "failed",
    "progress": { "variant": 1, "progress": 0.45, "best": Score },
    "timetableIds": ["tt7","tt8","tt9"],   // when done
    "error": "…" }                         // when failed
```

- Only assignments whose audience touches one of `groupIds` are scheduled.
- Lessons with `locked: true` in `baseTimetableId` must be kept exactly as they are.
- Every variant must satisfy the hard constraints in report §2.1.3; `iterations`
  is a hint for effort (the frontend uses 80 / 250 / 700) — map it to a time limit.
- The frontend polls once per second.

The browser-side generator in `frontend/src/domain/generator.ts` and the validator
in `frontend/src/domain/validator.ts` / `score.ts` define what "valid" and
"score" mean today; the backend's CP-SAT solver should produce scores the same
validator agrees with.

## Schedule changes

One-off changes for a specific date: a pair moves to another room, or a
substitute teacher takes it. The published timetable is not modified. Creating a
change also creates a notification for everyone (`kind: "room-change"` or
`"teacher-change"`).

| Method | Path            | Role  | Body / response                           |
| ------ | --------------- | ----- | ----------------------------------------- |
| GET    | `/changes`      | any   | `ScheduleChange[]`                        |
| POST   | `/changes`      | admin | change without `id`/`createdAt` → created |
| DELETE | `/changes/{id}` | admin | `204`                                     |

```json
// ScheduleChange — the pair is identified by assignmentId + slot on that date
{ "id": "c1", "date": "2026-10-05", "assignmentId": "a1", "slot": 1, "kind": "room",
  "fromRoomId": "r1", "roomId": "r2", "note": "Aula 3-114 este în renovare", "createdAt": "2026-10-02T14:00:00.000Z" }
{ "id": "c2", "date": "2026-10-06", "assignmentId": "a7", "slot": 3, "kind": "teacher",
  "fromRoomId": "r2", "teacherId": "t10", "createdAt": "2026-10-02T14:05:00.000Z" }
```

The server should reject a change whose new room or substitute teacher is
already busy at that slot on that date (`422`).

## Notifications

| Method | Path                  | Role | Body / response                                    |
| ------ | --------------------- | ---- | -------------------------------------------------- |
| GET    | `/notifications`      | any  | notifications that concern the caller, with `read` |
| POST   | `/notifications/read` | any  | `{ ids: string[] }` → `204`                        |

```json
{
  "id": "n7",
  "createdAt": "2026-10-02T14:00:00.000Z",
  "kind": "room-change",
  "params": {
    "assignmentId": "a1",
    "date": "2026-10-05",
    "slot": 1,
    "fromRoomId": "r1",
    "roomId": "r2"
  },
  "title": "",
  "body": "",
  "roles": [],
  "groupIds": ["g1", "g2", "g3", "g4", "g8"],
  "teacherIds": ["t3"],
  "read": false
}
```

- **Text:** notifications carry a `kind` and `params`; the client writes the text
  in the viewer's language (RO/RU/EN). Kinds: `welcome`, `published` (`name`), `unpublished` (`name`),
  `updated` (`name`, `count`), `availability` (`name`), `room-change` and
  `teacher-change` (the change's fields). `title`/`body` are only used for
  free-text messages without a `kind`.
- **Who sees it:** `roles: []` means every role. A notification with `groupIds` /
  `teacherIds` (schedule changes: the affected groups and both teachers) reaches
  only those students and teachers; administrators always see everything.

## Exams and atestări

UTM rules (REG-85-OS ECTS, academic calendar): atestări in teaching weeks 7 and
14 — in the subject's own class, or (if `settings.evaluation.midtermMode` is
`separate`) in a separate timetable after classes; one exam a day, at least
`examMinGap` free days between a group's exams, a consultation the day before
(or just before); retakes after the session in afternoon pairs. Settings live in
`Settings.evaluation` (`EvaluationSettings`, incl. `vacations`); a subject's
`evaluation` is `exam` (default) or `atestari`. Atestări held in class are
generated from the published timetable (each event has `lessonId`, labs a
`subgroup`). Final exams use `Teacher.examUnavailable` (exam-period availability,
separate from the weekly one: `"2026-12-15"` whole day, `"2026-12-15|am"` before
13:00, `"|pm"` after) and prefer the rooms the subject is taught in.

| Method | Path                             | Role   | Notes                                                                                                                                                    |
| ------ | -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/exams`                         | public | `ExamEvent[]` of every faculty's **published** plans                                                                                                     |
| GET    | `/exams/plans`                   | admin  | every plan of this faculty (all rounds, drafts and published)                                                                                            |
| DELETE | `/exams/plans/{round}`           | admin  | delete this faculty's plan for that round                                                                                                                |
| GET    | `/exams/plans/{round}`           | admin  | this faculty's `ExamPlan` (`round`: `midterm1`, `midterm2`, `session`, `remidterm1`, `remidterm2`, `reexam`) or `null`                                   |
| POST   | `/exams/plans/{round}/generate`  | admin  | new draft; other faculties' published events and this faculty's other rounds stay booked; returns the plan + `warnings` (count of exams that didn't fit). Optional body `{ "seed": 42 }` repeats a run; the same seed gives the same plan |
| PUT    | `/exams/plans/{round}`           | admin  | save edited events                                                                                                                                       |
| POST   | `/exams/plans/{round}/publish`   | admin  | make it public                                                                                                                                           |
| POST   | `/exams/plans/{round}/unpublish` | admin  | back to draft                                                                                                                                            |

```json
// ExamEvent — an exam or its consultation, for one group
{
  "id": "E1",
  "kind": "exam",
  "round": "session",
  "subjectId": "sub1",
  "groupId": "g1",
  "teacherId": "t3",
  "roomId": "r4",
  "date": "2026-12-14",
  "start": "12:00",
  "end": "14:15"
}
```

## Master's (study cycle)

Groups and subjects have `cycle`: `licenta` (default) or `master`. Master's groups
follow `Settings.masterEvaluation` — only what differs from licență
(`startOffsetWeeks` after licență's week 1, its atestare weeks, sessions, exam
days and hours, `consultation: "sameDay"`…) — and `Settings.masterYearShifts`
(evening part of the day). A master's group is compared only with master's
subjects in the study-plan check. Holidays, pair times, rooms and teachers are
shared, so a teacher who teaches both cycles is checked across both.

## Group calendar (internships, VP, licence exam)

`Settings.groupPeriods: GroupPeriod[]` — `{ id, kind, start, end, groupIds }` with
`kind`: `internship` (stagiu de practică: the students are at their internship,
not at university — no classes, atestări or exams; their atestări move to the
weeks they are at university, e.g. internship in weeks 1–4 → atestări in weeks 9
and 14, fewer than 8 teaching weeks → a single atestare), `examSession` (the
group's own exam session, e.g. a final year right after a short spring),
`plagiarism` (VP) and `licence` (EL, examen de licență).
