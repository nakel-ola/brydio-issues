# Plan

Plan is Brydio's project-planning app. It replaces the former Issues app while
keeping the published app identity `issues`.

## Add only what a project needs

Each Brydio project can add these surfaces independently:

- **List** — the complete issue workspace, with List, Kanban, Calendar, Gantt,
  and Spreadsheet layouts.
- **Sprint** — the project's current sprint and sprint planning.
- **Sprints** — a project-sidebar folder whose children are the project's
  draft, upcoming, active, completed, and cancelled sprints.

The workspace can also add **Plan**, which provides Home, Your work, and
Analytics across projects.

## Included workflows

Plan 1.0 includes project states and settings, quick and detailed issue
creation, filtering, grouping, ordering, bulk actions, sub-issues, relations,
comments and replies, reactions, votes, subscriptions, project-file
attachments, external links, activity, sprints, modules, saved views, Inbox,
Drafts, Archive, Your work, Analytics, live updates, and bounded rendering for
large projects.

Plan records belong directly to Brydio projects. Version 1.0 is a clean data
model and does not migrate records from the former Issues board.

## Structure

| Path | Purpose |
|---|---|
| `.brydio/app.json` | Plan's manifest, keyed placements, records, tools, and grants. |
| `src/screens/plan.tsx` | Workspace Plan and project List screen. |
| `src/screens/sprint.tsx` | Sprint tab and Sprint-folder child screen. |
| `src/screens/issue.tsx` | Shared issue detail entry. |
| `src/features/` | Issues, sprints, modules, views, insights, and settings. |
| `src/handlers/` | Bounded bulk, sprint-folder, relation, and signal tools. |
| `test/` | Fake-host workflow, isolation, paging, and scale coverage. |
| `bundle/` | Immutable repository release generated from `dist/`. |

## Build and verify

Plan uses Bun 1.3 and the exact SDK version declared in `package.json`.

```sh
bun install
bun test
bun run check-types
bun run build
bun run validate
```

`bun run build` writes `dist/` and refreshes the repository-ready `bundle/`.
The app remains below Brydio's 1 MiB bundle limit.

## Local development

```sh
bun run dev
```

The development server rebuilds when source files change. To publish a local
version, use the Brydio SDK CLI against this repository after the full check
above passes.
