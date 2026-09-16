import type { DocumentOf } from '@brydio/manifest';

/**
 * What an issue is, and the board's three columns, kept apart from the
 * screen so the order of the columns is written down once.
 */

/** The `issues` collection's schema, as `.brydio/app.json` declares it. */
export const ISSUE_SCHEMA = {
  title: 'string',
  status: ['todo', 'doing', 'done'],
  assignee: 'member?',
  labels: 'string[]',
  body: 'text?',
  project: 'project?',
} as const;

export type Issue = DocumentOf<typeof ISSUE_SCHEMA>;

export type Status = Issue['status'];

/** Left to right, as the board shows them. */
export const COLUMNS: readonly { status: Status; title: string }[] = [
  { status: 'todo', title: 'To do' },
  { status: 'doing', title: 'Doing' },
  { status: 'done', title: 'Done' },
];

/** The status one column to the left or right, or null at the edge of the board. */
export function neighbour(status: Status, step: -1 | 1): Status | null {
  const at = COLUMNS.findIndex(column => column.status === status);

  return COLUMNS[at + step]?.status ?? null;
}

/** An error in words a person can read on the board. */
export function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
