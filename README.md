# Issues

A simple issue tracker that lives inside a Brydio project. It is the first app
made with the Brydio SDK (`../brydio-sdk`).

## What it does (version 0.1.0)

- Shows a **board** with three columns: **To do**, **Doing** and **Done**.
- Each issue is a **card** with its title and two arrow buttons, **←** and
  **→**, that move it one column left or right.
- **New issue** adds an issue called "New issue" to To do.
- Every change asks the person first (Brydio shows an *Allow once* / *Don't
  allow* card), then the board reloads.
- If something goes wrong (the person says no, or someone else moved the same
  issue a moment earlier) a red line on the board says what happened.

It keeps two kinds of record: **issues** (a title, a status, who it is
assigned to, labels, a longer description and the project it belongs to) and
**labels** (a name and a colour). Brydio makes the tools for these by itself,
so the assistant can create, list and move issues in a chat too.

It can appear as a **project tab**, in a **project's sidebar**, and at the top
of the **workspace sidebar**.

### What it can't do yet

- **Type anything.** Phase 0 of Brydio gives a screen five building blocks
  (a stack, a heading, a text, a button and a card) and no text box, so a new
  issue is always called "New issue". Rename it from a chat with the
  assistant for now; the next version adds a proper form once Brydio has an
  input.
- **Open a single issue.** The `issue` screen is a placeholder.
- **Update live.** If someone else changes an issue, the board shows it after
  the next change you make, or when you open the tab again.

## The files

| File | What it is |
|---|---|
| `.brydio/app.json` | The manifest: the app's name and version, its records, where it appears, its screens and what it asks Brydio for. |
| `src/screens/board.tsx` | The board. |
| `src/screens/issue.tsx` | The placeholder for one issue. |
| `src/issues.ts` | What an issue is, and the order of the columns. |
| `test/board.test.ts` | Runs the built board in a pretend Brydio with three sample issues, presses its buttons, and checks what it did. |

## Building and checking it

You need [Bun](https://bun.sh) 1.3, and the SDK beside this folder at
`../brydio-sdk`.

```sh
cd brydio-issues
bun install          # takes the SDK packages from ../brydio-sdk
bun run build        # writes dist/app.json and dist/screens/*.js, prints the size and fingerprint
bun run validate     # checks everything Brydio would refuse
bun test             # the board, end to end, in a pretend Brydio
bun run check-types
```

After changing the SDK, run `rm -rf node_modules && bun install` here so this folder picks up
the new copy.

`bun run dev` builds, serves `dist/` on `http://localhost:5174`, and builds
again whenever a file changes.

## Loading it into a local Brydio

Phase 0 has no "publish" button yet. A build goes into a local Brydio's
database with a script in Brydio's API, which works only in development. **A
version can never be taken back or replaced**, so each load needs a new
`version` in `.brydio/app.json` (0.1.0, then 0.1.1, …).

With a local Brydio set up (its `apps/api/.env` pointing at your local
database, migrations applied, and `FEATURE_APPS` set to `allow` or `on`):

```sh
cd brydio-issues
bun run build && bun run validate

cd ../brydio/apps/api
NODE_ENV=development ./node_modules/.bin/ts-node scripts/put-app-bundle.ts ../../../brydio-issues/dist --by "your name"
```

It prints one line, like:

```json
{"ok":true,"appKey":"issues","version":"0.1.0","versionId":"…","bundleHash":"fa681d61…","files":["http://localhost:4000/api/v1/apps/bundles/fa681d61…/screens/board.js", "…"]}
```

The `bundleHash` is the same fingerprint `bun run build` printed. If it says
`"ok":false`, the `reason` says why (most often: that version was already
loaded, so raise the version number).

Then, to see it in a project, a workspace admin needs Issues in the workspace
(an app called `issues`), installed (`POST /api/v1/apps/installs` with its
`appId`, which picks up the newest loaded version), an instance
(`POST /api/v1/apps/instances`), and a placement on a project
(`POST /api/v1/apps/placements` with `kind: "project-tab"` and
`screen: "board"`). The project then has an **Issues** tab.
