import { PRIORITIES, type Issue } from './schemas.ts';

export type { Issue } from './schemas.ts';

export interface IssueFilters {
  projectId?: string;
  archived?: boolean;
  draft?: boolean;
  priorities?: readonly Issue['priority'][];
  stateIds?: readonly string[];
  assigneeId?: string;
  sprintId?: string;
  moduleId?: string;
  query?: string;
}

export function filterIssues(issues: readonly Issue[], filters: IssueFilters): Issue[] {
  const query = filters.query?.trim().toLocaleLowerCase();

  return issues.filter(issue => {
    if (filters.projectId && issue.project !== filters.projectId) return false;
    if (Boolean(issue.archived) !== Boolean(filters.archived)) return false;
    if (Boolean(issue.draft) !== Boolean(filters.draft)) return false;
    if (filters.priorities?.length && !filters.priorities.includes(issue.priority)) return false;
    if (filters.stateIds?.length && (!issue.state || !filters.stateIds.includes(issue.state))) return false;
    if (filters.assigneeId && !issue.assignees.includes(filters.assigneeId)) return false;
    if (filters.sprintId && issue.sprint !== filters.sprintId) return false;
    if (filters.moduleId && !issue.modules.includes(filters.moduleId)) return false;
    if (query && !`${issue.title} ${issue.description ?? ''}`.toLocaleLowerCase().includes(query)) return false;

    return true;
  });
}

export type IssueSort = { field: 'priority' | 'rank' | 'createdAt' | 'updatedAt' | 'target' | 'title'; direction: 'asc' | 'desc' };

export function sortIssues(issues: readonly Issue[], sort: IssueSort): Issue[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  const priority = new Map(PRIORITIES.map((value, index) => [value, index]));

  return [...issues].sort((a, b) => {
    const left = sort.field === 'priority' ? priority.get(a.priority ?? 'none') ?? PRIORITIES.length : String(a[sort.field] ?? '');
    const right = sort.field === 'priority' ? priority.get(b.priority ?? 'none') ?? PRIORITIES.length : String(b[sort.field] ?? '');
    const compared = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));

    return compared * direction || String(a.rank ?? '').localeCompare(String(b.rank ?? '')) || a.id.localeCompare(b.id);
  });
}

export type IssueGroup = 'none' | 'state' | 'priority' | 'assignee' | 'sprint' | 'module';

export function groupIssues(issues: readonly Issue[], group: IssueGroup): Map<string, Issue[]> {
  const grouped = new Map<string, Issue[]>();

  for (const issue of issues) {
    const keys = group === 'none' ? ['all']
      : group === 'assignee' ? (issue.assignees.length ? issue.assignees : ['unassigned'])
        : group === 'module' ? (issue.modules.length ? issue.modules : ['none'])
          : [String(group === 'state' ? issue.state ?? 'none' : group === 'priority' ? issue.priority : issue.sprint ?? 'none')];

    for (const key of keys) grouped.set(key, [...(grouped.get(key) ?? []), issue]);
  }

  return grouped;
}

export const issueIdentifier = (issue: Pick<Issue, 'sequence'>, projectName = 'PLAN') =>
  `${projectName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'PLAN'}-${issue.sequence ?? '?'}`;
