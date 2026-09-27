import { build } from '@brydio/cli';
import { FakeHost } from '@brydio/fake-host';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { analyticsOf } from '../src/features/analytics/analytics.tsx';
import type { Issue, State } from '../src/model/schemas.ts';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
const entry = join(root, 'dist/screens/plan.js');
const PROJECTS = [{ id: 'project_alpha', name: 'Alpha' }, { id: 'project_beta', name: 'Beta' }];
const MEMBERS = [{ id: 'user_ada', name: 'Ada Lovelace' }, { id: 'user_bo', name: 'Bo Diddley' }];
const ISSUES: Issue[] = [
  { id: 'i1', version: 1, title: 'Finished', project: 'project_alpha', state: 'done_a', priority: 'high', assignees: ['user_ada'], labels: [], modules: [], archived: false, draft: false, createdAt: '2026-07-03T08:00:00Z', completed: '2026-08-10', updatedAt: '2026-08-10T09:00:00Z' },
  { id: 'i2', version: 1, title: 'Alpha open', project: 'project_alpha', state: 'doing_a', priority: 'urgent', assignees: ['user_bo'], labels: [], modules: [], archived: false, draft: false, createdAt: '2026-08-04T08:00:00Z', updatedAt: '2026-09-20T09:00:00Z' },
  { id: 'i3', version: 1, title: 'Beta open', project: 'project_beta', state: 'todo_b', priority: 'low', assignees: ['user_ada'], labels: [], modules: [], archived: false, draft: false, createdAt: '2026-09-05T08:00:00Z', updatedAt: '2026-09-22T09:00:00Z' },
  { id: 'i4', version: 1, title: 'Hidden draft', project: 'project_beta', state: 'todo_b', priority: 'medium', assignees: ['user_ada'], labels: [], modules: [], archived: false, draft: true, createdAt: '2026-09-06T08:00:00Z' },
];
const STATES: State[] = [
  { id: 'done_a', version: 1, name: 'Done', project: 'project_alpha', group: 'completed', colour: 'success', position: 3 },
  { id: 'doing_a', version: 1, name: 'In progress', project: 'project_alpha', group: 'started', colour: 'brand', position: 2 },
  { id: 'todo_b', version: 1, name: 'To do', project: 'project_beta', group: 'unstarted', colour: 'neutral', position: 1 },
];
const FIXTURES = {
  issues: ISSUES,
  states: STATES,
  labels: [], links: [], modules: [], views: [],
  sprints: [{ id: 's1', name: 'Sprint 1', project: 'project_alpha', status: 'active' }],
  project_plan: [{ id: 'pp1', project: 'project_alpha', priority: 'high', default_view: 'list' }],
};
const HOST_FIXTURES = {
  ...FIXTURES,
  issues: FIXTURES.issues.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...issue }) => issue),
};
let host: FakeHost | null = null;

beforeAll(async () => {
  expect((await build(root)).problems.filter(problem => problem.severity === 'error')).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

async function openWorkspace() {
  host = FakeHost.start({
    entry,
    manifest,
    fixtures: HOST_FIXTURES,
    directory: { projects: PROJECTS, members: MEMBERS },
    context: { placement: { id: 'place_home', kind: 'workspace-sidebar' } },
  });
  await host.mounted();
  await host.waitFor(() => host!.byText('Open issues'), { what: 'the workspace snapshot' });
}

function selectSection(id: string) {
  const menu = host!.findAll(node => node.type === 'bry-section-menu')[0]!;

  host!.raise('bry-section-menu', menu, 'select', { id });
}

describe('Plan workspace', () => {
  test('summarizes project work without inventing a project overview surface', async () => {
    await openWorkspace();

    expect(host!.byText('2')).toBeTruthy();
    expect(await host!.waitFor(() => host!.byText('Alpha'), { what: 'project names' })).toBeTruthy();
    expect(host!.byText('Beta')).toBeTruthy();
    expect(host!.byText('Finished')).toBeTruthy();
    expect(host!.byText('Assigned issues')).toBeTruthy();

    expect(host!.byText('Project overview')).toBeUndefined();
  });

  test('computes fixed analytics and filters every chart and table by project', async () => {
    const all = analyticsOf(FIXTURES.issues, FIXTURES.states);
    const alpha = analyticsOf(FIXTURES.issues, FIXTURES.states, 'project_alpha');

    expect(all.priority.map(one => [one.label, one.value])).toEqual([
      ['Urgent', 1], ['High', 1], ['Medium', 0], ['Low', 1], ['None', 0],
    ]);
    expect(all.timeline).toEqual([
      { month: '2026-07', created: 1, resolved: 0 },
      { month: '2026-08', created: 1, resolved: 1 },
      { month: '2026-09', created: 1, resolved: 0 },
    ]);
    expect(all.completion).toEqual({ completed: 1, open: 2 });
    expect(alpha.projectLoad).toEqual([{ id: 'project_alpha', value: 2 }]);

    await openWorkspace();
    selectSection('analytics');
    expect(await host!.waitFor(() => host!.byText('Analytics'), { what: 'analytics' })).toBeTruthy();
    expect(host!.findAll(node => node.type === 'bry-chart')).toHaveLength(5);
    expect(host!.findAll(node => node.type === 'bry-data-table')).toHaveLength(5);

    const project = host!.findAll(node => node.type === 'bry-select' && node.props.label === 'Project')[0]!;
    host!.raise('bry-select', project, 'change', { value: 'project_alpha' });
    await host!.waitFor(() => host!.findAll(node => node.type === 'bry-select' && node.props.label === 'Project' && node.props.value === 'project_alpha')[0], { what: 'project selection' });
    const stateChart = await host!.waitFor(
      () => host!.findAll(node => node.type === 'bry-chart'
        && node.props.label === 'Issues by state'
        && (node.props.categories as string[]).length === 2
        && !(node.props.categories as string[]).includes('To do'))[0],
      { what: 'project-filtered analytics' },
    );
    expect([...(stateChart.props.categories as string[])].sort()).toEqual(['Done', 'In progress']);
    expect(stateChart.props.series).toEqual([{ name: 'Issues', values: [1, 1] }]);
    const load = host!.findAll(node => node.type === 'bry-data-table' && node.props.label === 'Project load')[0]!;
    expect(load.props.rows).toEqual([{ id: 'project_alpha', cells: ['Alpha', '2'] }]);
  });

  test('shows assigned and recent work with a member filter', async () => {
    await openWorkspace();
    selectSection('your-work');
    expect(await host!.waitFor(() => host!.byText('Assigned work'), { what: 'assigned work' })).toBeTruthy();
    expect(host!.byText('Alpha open')).toBeTruthy();
    expect(host!.byText('Beta open')).toBeTruthy();

    const assignee = host!.findAll(node => node.type === 'bry-select' && node.props.label === 'Assignee')[0]!;
    host!.raise('bry-select', assignee, 'change', { value: 'user_bo' });
    await host!.waitFor(() => host!.byText('Beta open') === undefined, { what: 'member-filtered work' });
    expect(host!.byText('Alpha open')).toBeTruthy();
    expect(host!.byText('Finished')).toBeUndefined();
    expect(host!.byText('Recent work')).toBeTruthy();
  });
});
