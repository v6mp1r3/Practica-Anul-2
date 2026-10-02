# Contributing

A short set of rules so four people can work on the same repo without stepping on
each other.

## Branches

- `main` — stable, reviewed code only. Nobody pushes to it directly.
- `frontend` — integration branch for the web client.
- `backend` — integration branch for the API and solver.
- Feature branches — branch off the relevant integration branch:
  `frontend/timetable-editor`, `backend/cp-sat-model`, `docs/use-case-diagram`.

```bash
git checkout frontend
git pull
git checkout -b frontend/my-feature
# ...work, commit...
git push -u origin frontend/my-feature
# open a Pull Request into `frontend`
```

## Avoiding conflicts

1. **Pull before you start** and before you push: `git pull --rebase`.
2. **Stay in your folder.** Frontend work goes in `frontend/`, backend in `backend/`.
   Shared files (`README.md`, `docs/API.md`) change through a PR so others see it.
3. **Keep commits small** and focused on one thing. Small PRs are reviewed faster and
   conflict less.
4. **Don't commit generated files** — `node_modules/`, `dist/`, `.env` are ignored.
5. **Lock files**: if you add a dependency, commit `package-lock.json` in the same
   commit as `package.json`.
6. Line endings and indentation are fixed by `.gitattributes` and `.editorconfig`;
   install the EditorConfig plugin in your editor.

## API contract

The frontend and backend agree on the endpoints described in
[`docs/API.md`](docs/API.md). If you change an endpoint, update that file in the same
PR and tag the other side for review.

## Commit messages

Imperative, short, no trailing period: `Add room capacity check`, `Fix parity filter`.
