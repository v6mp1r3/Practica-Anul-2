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
  `401` = not signed in, `403` = wrong role, `404` = not found, `422` = invalid data.

Until the backend exists the frontend runs with `VITE_API_MODE=mock`, which
implements this exact contract in the browser (`frontend/src/api/mock.ts`). It is the
reference behaviour when something here is unclear.

## Roles

| Role      | Can do                                                            |
| --------- | ----------------------------------------------------------------- |
| `admin`   | Everything: data management, generation, editing, publishing      |
| `teacher` | Read published timetable and dataset; update **own** availability |
| `student` | Read published timetable and dataset                              |

## Auth

| Method | Path           | Body                     | Response          |
| ------ | -------------- | ------------------------ | ----------------- |
| POST   | `/auth/login`  | `{ username, password }` | `{ token, user }` |
| GET    | `/auth/me`     | —                        | `User`            |
| POST   | `/auth/logout` | —                        | `204`             |

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
reference it.

```json
// Teacher — slot keys are "day:slot", day 0 = Monday, slot 0 = first pair
{ "id": "t1", "name": "Daniel Rusu", "title": "lect. univ.", "department": "Ingineria Software",
  "email": "daniel.rusu@fcim.example.md", "maxPairsPerWeek": 12,
  "activityTypes": ["lecture", "seminar", "lab"],
  "unavailable": ["4:4", "4:5"], "preferred": ["1:1"], "consultation": "2:3" }

// Room
{ "id": "r8", "name": "3-404", "building": "Blocul 3", "capacity": 16, "type": "lab", "equipment": ["calculatoare"] }

// Group
{ "id": "g1", "name": "FAF-251", "program": "Ingineria Software", "faculty": "Facultatea Calculatoare, Informatică și Microelectronică", "year": 1, "size": 24, "subgroups": 2 }

// Stream (groups that attend a lecture together)
{ "id": "s1", "name": "FAF-25", "groupIds": ["g1", "g2"] }

// Subject — pairs per week from the study plan; 0.5 = every other week
{ "id": "sub1", "code": "AM", "name": "Analiză matematică", "credits": 6, "year": 1,
  "lecturePairs": 2, "seminarPairs": 1, "labPairs": 0 }

// Assignment (teaching load). audience.kind is "stream" | "group" | "subgroup"
{ "id": "a1", "subjectId": "sub1", "type": "lecture", "teacherId": "t3",
  "audience": { "kind": "stream", "id": "s3" },
  "pairsPerWeek": 2, "parity": "weekly", "roomType": "lecture", "equipment": [] }
```

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
