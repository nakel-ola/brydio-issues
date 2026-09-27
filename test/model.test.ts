import { describe, expect, test } from 'bun:test';

import {
  filterIssues,
  groupIssues,
  sortIssues,
  type Issue,
} from '../src/model/issues.ts';
import {
  completionOf,
  sprintPhase,
  type Sprint,
} from '../src/model/planning.ts';

const issues: Issue[] = [
  {
    id: 'i1', version: 1, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    title: 'Ship Plan', project: 'p1', priority: 'urgent', state: 'doing', assignees: ['u1'],
    labels: ['l1'], modules: ['m1'], sprint: 's1', archived: false, draft: false, rank: 1024,
  },
  {
    id: 'i2', version: 1, createdAt: '2026-09-02T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
    title: 'Write docs', project: 'p1', priority: 'low', state: 'done', assignees: ['u2'],
    labels: [], modules: [], archived: true, draft: false, rank: 2048,
  },
  {
    id: 'i3', version: 1, createdAt: '2026-09-03T00:00:00Z', updatedAt: '2026-09-03T00:00:00Z',
    title: 'Other project', project: 'p2', priority: 'high', state: 'todo', assignees: ['u1'],
    labels: [], modules: [], archived: false, draft: false, rank: 1024,
  },
];

describe('the Plan issue model', () => {
  test('filters project data before applying issue filters', () => {
    expect(filterIssues(issues, { projectId: 'p1' }).map(one => one.id)).toEqual(['i1']);
    expect(filterIssues(issues, { projectId: 'p1', archived: true }).map(one => one.id)).toEqual(['i2']);
    expect(filterIssues(issues, { projectId: 'p1', assigneeId: 'u1', query: 'ship' }).map(one => one.id)).toEqual(['i1']);
  });

  test('orders priority literally and groups without losing ungrouped issues', () => {
    expect(sortIssues(issues, { field: 'priority', direction: 'asc' }).map(one => one.id)).toEqual(['i1', 'i3', 'i2']);
    expect([...groupIssues(issues, 'state').entries()].map(([key, rows]) => [key, rows.map(one => one.id)])).toEqual([
      ['doing', ['i1']],
      ['done', ['i2']],
      ['todo', ['i3']],
    ]);
  });
});

describe('planning calculations', () => {
  const sprint = (over: Partial<Sprint> = {}): Sprint => ({
    id: 's1', version: 1, createdAt: '', updatedAt: '', name: 'Sprint 1', project: 'p1',
    status: 'active', start: '2026-09-21', end: '2026-10-04', ...over,
  });

  test('classifies sprint boundaries using injected dates', () => {
    expect(sprintPhase(sprint(), '2026-09-20')).toBe('upcoming');
    expect(sprintPhase(sprint(), '2026-09-21')).toBe('active');
    expect(sprintPhase(sprint(), '2026-10-04')).toBe('active');
    expect(sprintPhase(sprint(), '2026-10-05')).toBe('completed');
    expect(sprintPhase(sprint({ status: 'draft' }), '2026-09-25')).toBe('draft');
  });

  test('reports literal completion counts and percentage', () => {
    expect(completionOf(issues, new Set(['done', 'cancelled']))).toEqual({ total: 3, completed: 1, percent: 33 });
    expect(completionOf([], new Set(['done']))).toEqual({ total: 0, completed: 0, percent: 0 });
  });
});
