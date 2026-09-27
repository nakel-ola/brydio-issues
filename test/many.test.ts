import { build } from '@brydio/cli';
import { FakeHost } from '@brydio/fake-host';
import { afterEach, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
const entry = join(root, 'dist/screens/plan.js');
const PROJECT = 'project_scale';
const STATES = [
  { id: 'todo', name: 'To do', project: PROJECT, group: 'unstarted', colour: 'neutral', position: 1 },
  { id: 'doing', name: 'In progress', project: PROJECT, group: 'started', colour: 'brand', position: 2 },
  { id: 'done', name: 'Done', project: PROJECT, group: 'completed', colour: 'success', position: 3 },
];
const MANY = Array.from({ length: 500 }, (_, at) => ({
  id: `issue_${String(at).padStart(3, '0')}`,
  title: `Issue ${at}`,
  project: at === 499 ? 'project_elsewhere' : PROJECT,
  sequence: at + 1,
  state: at < 350 ? 'todo' : at < 450 ? 'doing' : 'done',
  priority: at % 5 === 0 ? 'high' : 'none',
  assignees: [], labels: [], modules: [], archived: false, draft: false,
  rank: (at + 1) * 1024,
}));
const FIXTURES = { issues: MANY, states: STATES, labels: [], links: [], sprints: [], modules: [], views: [], project_plan: [] };
let host: FakeHost | null = null;

beforeAll(async () => {
  expect((await build(root)).problems.filter(problem => problem.severity === 'error')).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

async function open() {
  host = FakeHost.start({
    entry,
    manifest,
    fixtures: FIXTURES,
    directory: { projects: [{ id: PROJECT, name: 'Scale' }] },
    context: { placement: { id: 'place_list', kind: 'project-sidebar', projectId: PROJECT }, route: { path: '/' } },
  });
  await host.mounted();
  await host.waitFor(
    () => host!.findAll(node => node.type === 'bry-breadcrumb' && Boolean((
      node.props.items as Array<{ label?: string }> | undefined
    )?.some(item => item.label === 'Issues')))[0],
    { what: 'Plan list', timeout: 5_000 },
  );
  await host.waitFor(() => host!.findAll(node => node.type === 'bry-badge' && node.props.text === '499')[0], { what: 'all project issues', timeout: 5_000 });
}

async function layout(value: string, ready: () => unknown) {
  const label = value[0]!.toUpperCase() + value.slice(1);

  host!.press(host!.byText(label)!);
  await host!.waitFor(ready, { what: `${value} layout`, timeout: 5_000 });
}

test('pages all 500 issues while every large layout keeps a bounded tree', async () => {
  await open();

  expect(host!.findAll(node => node.type === 'bry-list-row' && typeof node.props.identifier === 'string').length).toBeLessThanOrEqual(300);
  expect(host!.tree.size).toBeLessThan(5_000);

  await layout('kanban', () => host!.findAll(node => node.type === 'bry-board')[0]);
  expect(host!.findAll(node => node.type === 'bry-card').length).toBeLessThanOrEqual(300);
  expect(host!.tree.size).toBeLessThan(5_000);

  await layout('spreadsheet', () => host!.findAll(node => node.type === 'bry-data-table' && node.props.label === 'Issue spreadsheet')[0]);
  const table = host!.findAll(node => node.type === 'bry-data-table' && node.props.label === 'Issue spreadsheet')[0]!;
  expect((table.props.rows as unknown[]).length).toBeLessThanOrEqual(200);
  expect(host!.tree.size).toBeLessThan(5_000);

  const reads = host!.calls.filter(call => call.tool === 'list_issues');
  expect(reads.length).toBeGreaterThanOrEqual(3);
});

test('coalesced active watches refresh the visible screen and keep prior data while reading', async () => {
  await open();

  host!.store!.put('issues', {
    id: 'issue_live', title: 'Live issue', project: PROJECT, sequence: 501, state: 'todo', priority: 'urgent',
    assignees: [], labels: [], modules: [], archived: false, draft: false, rank: 1,
  });
  expect(host!.byText('Issue 1')).toBeTruthy();
  await host!.waitFor(() => host!.byText('Live issue'), { what: 'live watched issue', timeout: 5_000 });
  expect(host!.findAll(node => node.type === 'bry-alert' && node.props.tone === 'danger')).toHaveLength(0);
});
