import { build } from '@brydio/cli';
import { FakeHost } from '@brydio/fake-host';
import { afterEach, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
const entry = join(root, 'dist/screens/plan.js');
let host: FakeHost | null = null;

beforeAll(async () => {
  expect((await build(root)).problems.filter(problem => problem.severity === 'error')).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

test('Home summarizes project work and project overview reports literal progress', async () => {
  const fixtures = {
    issues: [
      { id: 'i1', title: 'Finished', project: 'project_alpha', state: 'done', priority: 'high', assignees: [], labels: [], modules: [], archived: false, draft: false },
      { id: 'i2', title: 'Open', project: 'project_alpha', state: 'doing', priority: 'urgent', assignees: [], labels: [], modules: [], archived: false, draft: false },
      { id: 'i3', title: 'Elsewhere', project: 'project_beta', state: 'todo', priority: 'low', assignees: [], labels: [], modules: [], archived: false, draft: false },
    ],
    states: [
      { id: 'done', name: 'Done', project: 'project_alpha', group: 'completed', colour: 'success', position: 3 },
      { id: 'doing', name: 'In progress', project: 'project_alpha', group: 'started', colour: 'brand', position: 2 },
      { id: 'todo', name: 'To do', project: 'project_beta', group: 'unstarted', colour: 'neutral', position: 1 },
    ],
    sprints: [{ id: 's1', name: 'Sprint 1', project: 'project_alpha', status: 'active' }],
    modules: [],
    project_plan: [{ id: 'pp1', project: 'project_alpha', priority: 'high', default_view: 'list' }],
  };

  host = FakeHost.start({
    entry,
    manifest,
    fixtures,
    directory: { projects: [{ id: 'project_alpha', name: 'Alpha' }, { id: 'project_beta', name: 'Beta' }] },
    context: { placement: { id: 'place_home', kind: 'workspace-sidebar' } },
  });
  await host.mounted();
  await host.waitFor(() => host!.byText('Open issues'), { what: 'the workspace snapshot' });
  await host.waitFor(() => host!.byText('Alpha'), { what: 'the project names' });

  expect(host.byText('2')).toBeTruthy();
  expect(host.byText('Alpha')).toBeTruthy();
  expect(host.byText('Beta')).toBeTruthy();
  expect(host.byText('Finished')).toBeTruthy();

  host.stop();
  host = FakeHost.start({
    entry,
    manifest,
    fixtures,
    directory: { projects: [{ id: 'project_alpha', name: 'Alpha' }] },
    context: { placement: { id: 'place_list', kind: 'project-tab', projectId: 'project_alpha' } },
  });
  await host.mounted();
  const menu = await host.waitFor(() => host!.findAll(node => node.type === 'bry-section-menu')[0], { what: 'the project menu' });

  host.raise('bry-section-menu', menu, 'select', { id: 'overview' });
  expect(await host.waitFor(() => host!.byText('50% complete'), { what: 'project progress' })).toBeTruthy();
  expect(host.byText('1 of 2 issues completed')).toBeTruthy();
});
