import { build } from '@brydio/cli';
import { FakeHost, type TreeNode } from '@brydio/fake-host';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
const entry = join(root, 'dist/screens/plan.js');
const issueEntry = join(root, 'dist/screens/issue.js');
const PROJECT = 'project_alpha';
const FIXTURES = {
  issues: [{
    id: 'i1', title: 'First task', description: 'Initial details', project: PROJECT, sequence: 1,
    state: 'todo', priority: 'high', assignees: ['user_ada'], labels: ['label_bug'], modules: ['module_core'],
    sprint: 'sprint_one', archived: false, draft: false, rank: 1024, estimate: 3,
  }],
  states: [
    { id: 'todo', name: 'To do', project: PROJECT, group: 'unstarted', colour: 'neutral', position: 1024 },
    { id: 'doing', name: 'In progress', project: PROJECT, group: 'started', colour: 'brand', position: 2048 },
  ],
  labels: [{ id: 'label_bug', name: 'Bug', colour: 'danger', project: PROJECT }],
  sprints: [{ id: 'sprint_one', name: 'Sprint 1', project: PROJECT, status: 'active' }],
  modules: [{ id: 'module_core', name: 'Core', project: PROJECT, status: 'started' }],
  project_plan: [],
};
let host: FakeHost | null = null;

beforeAll(async () => {
  expect((await build(root)).problems.filter(problem => problem.severity === 'error')).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

const of = (type: string, words?: string): TreeNode | undefined =>
  host!.findAll(node => node.type === type && (words === undefined || node.props.label === words || node.props.text === words || node.props.title === words))[0];

async function open(selected = 'i1', options: Partial<Parameters<typeof FakeHost.start>[0]> = {}) {
  host = FakeHost.start({
    entry,
    manifest,
    fixtures: FIXTURES,
    directory: {
      projects: [{ id: PROJECT, name: 'Alpha project' }, { id: 'project_beta', name: 'Beta project' }],
      members: [{ id: 'user_ada', name: 'Ada Lovelace' }, { id: 'user_bo', name: 'Bo Diddley' }],
    },
    context: {
      placement: { id: 'place_list', kind: 'project-tab', projectId: PROJECT },
      selection: { kind: 'item', id: selected },
    },
    ...options,
  });
  await host.mounted();
  await host.waitFor(() => of('bry-input', 'Title')?.props.value === 'First task', { what: 'issue detail' });
}

describe('Plan issue detail', () => {
  test('queues property saves and debounces title and description edits', async () => {
    await open();

    host!.raise('bry-select', of('bry-select', 'State')!, 'change', { value: 'doing' });
    await host!.waitFor(() => host!.calls.filter(call => call.tool === 'update_issue').length === 1);

    const title = of('bry-input', 'Title')!;
    host!.raise('bry-input', title, 'change', { value: 'First task revised' });
    const description = of('bry-textarea', 'Description')!;
    host!.raise('bry-textarea', description, 'change', { value: 'Revised details' });
    await Bun.sleep(300);
    expect(host!.calls.filter(call => call.tool === 'update_issue')).toHaveLength(1);
    await host!.waitFor(() => host!.calls.filter(call => call.tool === 'update_issue').length === 3, { timeout: 3_000 });

    expect(host!.calls.filter(call => call.tool === 'update_issue').map(call => call.input)).toEqual([
      { id: 'i1', version: 1, state: 'doing' },
      { id: 'i1', version: 2, title: 'First task revised' },
      { id: 'i1', version: 3, description: 'Revised details' },
    ]);
  });

  test('saves every planning property from the version returned by the prior write', async () => {
    await open();
    let count = 0;
    const change = async (label: string, value: string) => {
      const control = of('bry-select', label)!;

      host!.raise('bry-select', control, 'change', { value });
      count += 1;
      await host!.waitFor(() => host!.calls.filter(call => call.tool === 'update_issue').length === count, { what: `${label} save` });
    };

    await change('State', 'doing');
    await change('Priority', 'urgent');
    await change('Assignee', 'user_bo');
    await change('Label', 'none');
    await change('Sprint', 'none');
    await change('Module', 'none');
    const target = of('bry-date', 'Target date')!;
    host!.raise('bry-date', target, 'change', { value: '2026-10-02' });
    count += 1;
    await host!.waitFor(() => host!.calls.filter(call => call.tool === 'update_issue').length === count, { what: 'target save' });
    const estimate = of('bry-input', 'Estimate')!;
    host!.raise('bry-input', estimate, 'submit', { value: '8' });
    count += 1;
    await host!.waitFor(() => host!.calls.filter(call => call.tool === 'update_issue').length === count, { what: 'estimate save' });

    expect(host!.calls.filter(call => call.tool === 'update_issue').map(call => call.input)).toEqual([
      { id: 'i1', version: 1, state: 'doing' },
      { id: 'i1', version: 2, priority: 'urgent' },
      { id: 'i1', version: 3, assignees: ['user_bo'] },
      { id: 'i1', version: 4, labels: [] },
      { id: 'i1', version: 5, sprint: null },
      { id: 'i1', version: 6, modules: [] },
      { id: 'i1', version: 7, target: '2026-10-02' },
      { id: 'i1', version: 8, estimate: 8 },
    ]);
  });

  test('drafts a chat, closes through navigation, and reloads after a stale save', async () => {
    await open();

    host!.press(host!.byText('Ask about this issue')!);
    await host!.waitFor(() => host!.asks.length === 1, { what: 'the chat draft' });
    expect(host!.asks[0]).toMatchObject({ target: { collection: 'issues', id: 'i1', title: 'First task' } });

    host!.store!.put('issues', { id: 'i1', title: 'Changed elsewhere' });
    host!.raise('bry-select', of('bry-select', 'Priority')!, 'change', { value: 'urgent' });
    await host!.waitFor(() => host!.byText('This issue changed. Reload it before saving again.'), { what: 'the stale warning' });
    expect(of('bry-select', 'Priority')!.props.disabled).toBe(true);

    host!.press(host!.byText('Reload issue')!);
    await host!.waitFor(() => of('bry-input', 'Title')?.props.value === 'Changed elsewhere', { what: 'the current issue' });

    host!.press(host!.byText('Back to issues')!);
    await host!.waitFor(() => host!.received.some(message => message.method === 'ui/navigate' && JSON.stringify(message.params) === '{"to":{"kind":"item","id":null}}'), { what: 'the closed selection' });
  });

  test('the issue entry opens the same detail and warns when it belongs to another project', async () => {
    const fixtures = { ...FIXTURES, issues: [{ ...FIXTURES.issues[0], project: 'project_beta' }] };

    await open('i1', { entry: issueEntry, fixtures });
    expect(await host!.waitFor(
      () => host!.findAll(node => node.type === 'bry-alert' && node.props.title === 'This issue belongs to Beta project.')[0],
      { what: 'the owning project' },
    )).toBeTruthy();
  });
});
