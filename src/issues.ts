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
  due: 'date?',
  rank: 'number?',
} as const;

export type Issue = DocumentOf<typeof ISSUE_SCHEMA>;

export type Status = Issue['status'];

/** Left to right, as the board shows them. */
export const COLUMNS: readonly { status: Status; title: string }[] = [
  { status: 'todo', title: 'To do' },
  { status: 'doing', title: 'Doing' },
  { status: 'done', title: 'Done' },
];

/** The gap left between ranks, so a card dropped between two needs no other card to change. */
export const RANK_STEP = 1024;

/**
 * One column's issues in the order the board draws them: by rank, then the
 * oldest first. An issue without a rank (made before ranks, or by the
 * assistant) comes after every ranked one.
 */
export function columnIssues<I extends Pick<Issue, 'status' | 'rank' | 'createdAt'>>(issues: readonly I[], status: Status): I[] {
  const at = (issue: I) => (typeof issue.rank === 'number' ? issue.rank : Number.POSITIVE_INFINITY);

  return issues
    .filter(issue => issue.status === status)
    .sort((a, b) => at(a) - at(b) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
}

/** A new rank for one card, or every card of a column renumbered, the moved one first. */
export type Placement = { rank: number } | { renumber: { id: string; rank: number }[] };

/**
 * Where a card dropped in `to` at `position` ranks: halfway between its
 * neighbours there, one step past the only neighbour it has, or the first
 * step in an empty column. Only when there is no room between the two (equal
 * ranks, a neighbour above without a rank, or halves too small to tell
 * apart) is the whole column renumbered, in steps, in the order it would be
 * drawn with the card in its new place.
 */
export function placeCard<I extends Pick<Issue, 'id' | 'status' | 'rank' | 'createdAt'>>(
  issues: readonly I[],
  id: string,
  to: Status,
  position: number,
): Placement {
  const others = columnIssues(issues, to).filter(issue => issue.id !== id);
  const at = Math.max(0, Math.min(others.length, position));
  const before = others[at - 1];
  const after = others[at];
  const renumber = (): Placement => {
    const order = [...others.slice(0, at), { id, rank: 0 }, ...others.slice(at)];
    // Unranked cards after the moved one already sort after every ranked card, so they keep no rank.
    const last = order.findLastIndex(one => one.id === id || typeof one.rank === 'number');
    const changes = order
      .slice(0, last + 1)
      .map((one, index) => ({ id: one.id, rank: (index + 1) * RANK_STEP }))
      .filter(change => change.id === id || issues.find(issue => issue.id === change.id)?.rank !== change.rank);

    return { renumber: [...changes.filter(change => change.id === id), ...changes.filter(change => change.id !== id)] };
  };

  // Above an unranked card, anything past the ranked ones will do.
  const high = typeof after?.rank === 'number' ? after.rank : undefined;

  if (!before) return { rank: high === undefined ? RANK_STEP : high - RANK_STEP };
  if (typeof before.rank !== 'number') return renumber();

  const low = before.rank;
  const ranked = others.map(one => one.rank).filter((rank): rank is number => typeof rank === 'number');

  if (high === undefined) return { rank: Math.max(low, ...ranked) + RANK_STEP };

  const middle = (low + high) / 2;

  return middle > low && middle < high ? { rank: middle } : renumber();
}

/** The rank for a new issue: after the last ranked one in To do. */
export function rankAfterLast(issues: readonly Pick<Issue, 'status' | 'rank'>[]): number {
  const ranks = issues
    .filter(issue => issue.status === 'todo')
    .map(issue => issue.rank)
    .filter((rank): rank is number => typeof rank === 'number');

  return (ranks.length ? Math.max(...ranks) : 0) + RANK_STEP;
}

/** An error in words a person can read on the board. */
export function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A due date as the card says it: "Due 3 Oct". The host's locale decides the words. */
export function dueText(due: string, locale = 'en-GB'): string {
  const [year, month, day] = due.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));

  return `Due ${date.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}
