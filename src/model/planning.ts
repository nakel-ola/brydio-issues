import type { Issue, Sprint, State } from './schemas.ts';

export type { Sprint } from './schemas.ts';
export type SprintPhase = 'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled';

export function sprintPhase(sprint: Sprint, today: string): SprintPhase {
  if (sprint.status === 'draft' || sprint.status === 'cancelled' || sprint.status === 'completed') return sprint.status;
  if (sprint.start && today < sprint.start) return 'upcoming';
  if (sprint.end && today > sprint.end) return 'completed';

  return 'active';
}

export function completionOf(issues: readonly Pick<Issue, 'state'>[], completedStates: ReadonlySet<string>) {
  const completed = issues.filter(issue => issue.state && completedStates.has(issue.state)).length;
  const total = issues.length;

  return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 };
}

export const completedStateIds = (states: readonly State[]) =>
  new Set(states.filter(state => state.group === 'completed' || state.group === 'cancelled').map(state => state.id));

export function nextSequence(issues: readonly Pick<Issue, 'project' | 'sequence'>[], projectId: string): number {
  return Math.max(0, ...issues.filter(one => one.project === projectId).map(one => one.sequence ?? 0)) + 1;
}

export function stateCounts(issues: readonly Pick<Issue, 'state'>[]) {
  const counts = new Map<string, number>();

  for (const issue of issues) counts.set(issue.state ?? 'none', (counts.get(issue.state ?? 'none') ?? 0) + 1);

  return counts;
}
