# Issues

A simple issue tracker that lives inside a Brydio project. It is the first app
made with the Brydio SDK (`../brydio-sdk`).

## What it does (version 0.11.3)

- Shows a **board** with three columns, **To do**, **Doing** and **Done**,
  each with how many issues it holds.
- Each issue is a **card** with its title, when it is due ("Due 3 Oct"), who
  it is assigned to (their avatar and name) and its labels.
- **Move a card** by dragging it to another column, or with the keyboard:
  Space picks it up, the arrow keys move it, Space puts it down and Escape
  puts it back. A card lands where it was dropped, in its own column or
  another, and stays there after a reload. A move that has to re-order other
  cards too asks once, and either all of it happens or none does. If the move doesn't go through,
  the card goes back.
- **Open an issue** by pressing its card. It opens in the same tab, with its
  own address to share, and **Back to the board** (or the browser's Back)
  returns. Its title, description, status, due date
  and labels each save on their own as you change them, with no Save button:
  the assignee is picked from the people Brydio lets this Issues name, the
  description is written in Markdown and read formatted, and the labels
  picker lists this Issues' labels and makes a **New label**. If somebody
  else changed the issue meanwhile, the save is refused with "Someone else
  changed this; reload to see", and **Reload** shows their change.
  The issue says who last changed it and whether on the board or through the
  assistant, and the assignee picker shows each person's initials.
  **Ask about this issue** opens a chat in the project with the issue attached
  and a question in the composer, for you to send or not. An issue opened
  from a link on a project it doesn't belong to says which project it does, with a button that opens that project.
- **New issue** opens a small form: type a title, pick a due date if you want
  one, then **Add** (or press Enter). In a project, the form shows the
  project the issue will belong to, and it can't be changed there.
- A card's actions button (**⋯**, named "Actions for" the issue's title for a
  screen reader) opens a menu with **Delete**.
- **Holds hundreds of issues.** It reads each column's first cards at once,
  opens with those, then reads the rest of every column in parallel, and each
  column draws only the cards around what is in view.
- **Updates live.** An issue somebody else makes, moves or deletes, in another
  tab or through the assistant in a chat, shows on an open board without a
  reload.
- Every change asks the person first (Brydio shows an *Allow once* / *Don't
  allow* card), and the board never asks a second time.
- If something goes wrong (the person says no, or someone else moved the same
  issue a moment earlier), a red line on the board says what happened. In the
  second case the board reads the issues again, so the next move starts from
  where they are now.

It keeps two kinds of record: **issues** (a title, a status, who it is
assigned to, labels, a longer description, a due date, the project it
belongs to, and a rank that keeps its place in its column) and **labels** (a name and a colour). Brydio makes the tools for
these by itself, so the assistant can create, list, move and delete issues in
a chat too.

It can appear as a **project tab**, in a **project's sidebar**, and at the top
of the **workspace sidebar**. Placed in a project, it shows only that
project's issues, and a new issue belongs to that project. At the top of the
workspace sidebar it shows every project's issues, each card naming its
project, with a **Project** filter to narrow the board.

### What it can't do yet

Each of these waits on something in Brydio, listed in its gap log.


## The files

| File | What it is |
|---|---|
| `.brydio/app.json` | The manifest: the app's name and version, its records, where it appears, its screens and what it asks Brydio for. |
| `src/screens/board.tsx` | The board. |
| `src/screens/issue-view.tsx` | One issue, opened from its card: each field saves on its own. |
| `src/screens/issue.tsx` | The same issue view, for a placement that names the `issue` screen with an issue selected. |
| `src/issues.ts` | What an issue is, the order of the columns, and how a due date reads. |
| `.brydio/samples.json` | The sample issues and labels `brydio publish` draws each screen with, for the pictures on the app's listing. |
| `test/many.test.ts` | A board of 500 issues: every page read, each column windowed, a move still one write. |
| `test/issue.test.ts` | Opens an issue from its card in the pretend Brydio, changes each field, and has somebody else change it first. |
| `test/board.test.ts` | Runs the built board in a pretend Brydio with three sample issues, drops cards in other columns, changes issues as somebody else would, and checks what the board did. |

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
