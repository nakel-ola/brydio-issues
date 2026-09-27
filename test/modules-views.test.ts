import { build } from '@brydio/cli';
import { FakeHost, type TreeNode } from '@brydio/fake-host';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_ISSUE_VIEW } from '../src/features/issues/issue-controls.tsx';
import { decodeView, encodeView } from '../src/features/views/views.tsx';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
const entry = join(root, 'dist/screens/plan.js');
const PROJECT = 'project_alpha';
const STATES = [
  { id: 'todo', name: 'To do', project: PROJECT, group: 'unstarted', colour: 'neutral', position: 1024 },
  { id: 'done', name: 'Done', project: PROJECT, group: 'completed', colour: 'success', position: 2048 },
];
const MODULES = ['backlog', 'planned', 'started', 'paused', 'completed', 'cancelled'].map((status, index) => ({
  id: `m${index + 1}`, name: `${status[0]!.toUpperCase()}${status.slice(1)} module`, project: PROJECT, status,
  ...(index === 0 ? { start: '2026-09-01', end: '2026-10-01', description: 'Core delivery' } : {}),
}));
const ISSUES = [
  { id: 'i1', title: 'Finished module task', project: PROJECT, sequence: 1, state: 'done', priority: 'high', assignees: [], labels: [], modules: ['m1'], archived: false, draft: false, inbox: 'none', rank: 1024 },
  { id: 'i2', title: 'Open module task', project: PROJECT, sequence: 2, state: 'todo', priority: 'medium', assignees: [], labels: [], modules: ['m1'], archived: false, draft: false, inbox: 'none', rank: 2048 },
  { id: 'i3', title: 'Inbox draft', project: PROJECT, sequence: 3, state: 'todo', priority: 'low', assignees: [], labels: [], modules: [], archived: false, draft: true, inbox: 'pending', rank: 3072 },
  { id: 'i4', title: 'Archived task', project: PROJECT, sequence: 4, state: 'done', priority: 'none', assignees: [], labels: [], modules: [], archived: true, draft: false, inbox: 'none', rank: 4096 },
  { id: 'i5', title: 'Available task', project: PROJECT, sequence: 5, state: 'todo', priority: 'high', assignees: [], labels: [], modules: [], archived: false, draft: false, inbox: 'none', rank: 5120 },
];
const VALID_VIEW = {
  id: 'v1', name: 'High priority table', description: 'Urgent work', project: PROJECT,
  filters: JSON.stringify({ priorities: ['high'] }),
  display: JSON.stringify({ ...DEFAULT_ISSUE_VIEW, filters: undefined, layout: 'spreadsheet', properties: ['identifier', 'priority'] }),
  shared: true,
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

function above(node: TreeNode | undefined, type: string): TreeNode | undefined {
  let current = node && host!.parentOf(node);

  while (current && current.type !== type) current = host!.parentOf(current);

  return current;
}

async function open(options: Partial<Parameters<typeof FakeHost.start>[0]> = {}) {
  host = FakeHost.start({
    entry,
    manifest,
    context: { placement: { id: 'place_list', kind: 'project-tab', projectId: PROJECT } },
    directory: { projects: [{ id: PROJECT, name: 'Alpha project' }], members: [{ id: 'user_ada', name: 'Ada Lovelace' }] },
    fixtures: {
      issues: ISSUES, labels: [], links: [{ id: 'link_m1', module: 'm1', project: PROJECT, title: 'Module spec', url: 'https://example.com/module' }],
      states: STATES, sprints: [], modules: MODULES, views: [VALID_VIEW], project_plan: [],
    },
    ...options,
  });
  await host.mounted();
  await host.waitFor(() => of('bry-menu'), { what: 'Plan navigation' });
}

async function section(id: string, heading: string) {
  const menu = of('bry-menu')!;
  host!.raise('bry-menu', menu, 'select', { id });
  return host!.waitFor(() => of('bry-heading', heading), { what: heading });
}

describe('Plan modules and views', () => {
  test('shows every module status, dates, progress, links, and issue membership', async () => {
    await open();
    await section('modules', 'Modules');
    expect(new Set(host!.findAll(node => node.type === 'bry-badge').map(node => node.props.text))).toEqual(new Set(['backlog', 'planned', 'started', 'paused', 'completed', 'cancelled']));
    host!.press(above(of('bry-heading', 'Backlog module'), 'bry-card')!);
    expect(await host!.waitFor(() => of('bry-progress', 'Module progress'), { what: 'module detail' })).toMatchObject({ props: { value: 50 } });
    expect(of('bry-date', 'Start date')?.props.value).toBe('2026-09-01');
    expect(of('bry-date', 'End date')?.props.value).toBe('2026-10-01');
    expect(host!.byText('Module spec')).toBeTruthy();

    host!.raise('bry-select', of('bry-select', 'Status')!, 'change', { value: 'paused' });
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_module'), { what: 'module status' });
    expect(host!.calls.find(call => call.tool === 'update_module')?.input).toMatchObject({ id: 'm1', version: 1, status: 'paused' });

    const picker = of('bry-select', 'Add existing issue')!;
    host!.raise('bry-select', picker, 'change', { value: 'i5' });
    host!.press(host!.byText('Add to module')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_issue' && JSON.stringify(call.input.modules) === '["m1"]'), { what: 'module membership' });
    host!.press(host!.byText('Remove from module')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_issue' && JSON.stringify(call.input.modules) === '[]'), { what: 'removed membership' });

    host!.raise('bry-input', of('bry-input', 'Module link title')!, 'change', { value: 'Research' });
    host!.raise('bry-input', of('bry-input', 'Module link URL')!, 'change', { value: 'https://example.com/research' });
    host!.press(host!.byText('Add module link')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'create_link'), { what: 'module link' });
    expect(host!.calls.find(call => call.tool === 'create_link')?.input).toEqual({ module: 'm1', project: PROJECT, title: 'Research', url: 'https://example.com/research' });
  });

  test('round-trips a saved view and safely falls back from malformed display text', async () => {
    const decoded = decodeView(VALID_VIEW as never);
    expect(decoded.layout).toBe('spreadsheet');
    expect(decoded.filters).toMatchObject({ priorities: ['high'] });
    expect(decodeView({ filters: '{bad', display: '{bad' }).layout).toBe('list');
    expect(decodeView({ filters: '{}', display: JSON.stringify({ layout: 'unknown' }) }).layout).toBe('list');
    const { filters: _filters, ...display } = decoded;
    expect(encodeView(decoded)).toEqual({ filters: JSON.stringify(decoded.filters), display: JSON.stringify(display) });

    await open();
    await section('views', 'Views');
    host!.press(host!.byText('High priority table')!);
    const table = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-data-table' && node.props.label === 'Issue spreadsheet')[0], { what: 'the saved layout' });
    expect((table.props.rows as { id: string }[]).map(row => row.id)).toEqual(['i1', 'i5']);
    expect(host!.byText('Open module task')).toBeUndefined();

    const layout = of('bry-toggle-group', 'Layout')!;
    host!.raise('bry-toggle-group', layout, 'change', { values: ['calendar'] });
    host!.press(host!.byText('Save view changes')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_view'), { what: 'saved view changes' });
    const call = host!.calls.find(one => one.tool === 'update_view')!;
    expect(JSON.parse(String(call.input.filters))).toMatchObject({ priorities: ['high'] });
    expect(JSON.parse(String(call.input.display))).toMatchObject({ layout: 'calendar' });
  });
});

describe('Plan inbox, drafts, and archive', () => {
  test('accepts an inbox issue by clearing inbox and draft state', async () => {
    await open();
    await section('inbox', 'Inbox');
    host!.press(host!.byText('Accept')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_issue'), { what: 'accepted inbox issue' });
    expect(host!.calls.find(call => call.tool === 'update_issue')?.input).toEqual({ id: 'i3', version: 1, inbox: 'none', inbox_until: null, draft: false });
  });

  test('declines, snoozes, and marks inbox issues as duplicates', async () => {
    await open();
    await section('inbox', 'Inbox');
    host!.press(host!.byText('Decline')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_issue' && call.input.inbox === 'declined'));

    host!.stop(); host = null;
    await open();
    await section('inbox', 'Inbox');
    host!.raise('bry-date', of('bry-date', 'Snooze until')!, 'change', { value: '2026-10-01' });
    host!.press(host!.byText('Snooze')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_issue' && call.input.inbox === 'snoozed'));
    expect(host!.calls.find(call => call.tool === 'update_issue')?.input).toMatchObject({ inbox_until: '2026-10-01' });

    host!.stop(); host = null;
    await open({ tools: { manage_relations: () => ({ content: [{ type: 'text', text: 'Related.' }], structuredContent: { related: true } }) } });
    await section('inbox', 'Inbox');
    const duplicate = of('bry-select', 'Duplicate of')!;
    host!.raise('bry-select', duplicate, 'change', { value: 'i5' });
    host!.press(host!.byText('Mark duplicate')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'manage_relations'), { what: 'duplicate relation' });
    expect(host!.calls.find(call => call.tool === 'manage_relations')?.input).toEqual({ project: PROJECT, issue: 'i3', target: 'i5', kind: 'duplicates' });
  });

  test('promotes a titled, stated draft and restores an archived issue', async () => {
    await open();
    await section('drafts', 'Drafts');
    host!.press(host!.byText('Inbox draft')!);
    const title = await host!.waitFor(() => of('bry-input', 'Draft title'), { what: 'draft editor' });
    host!.raise('bry-input', title, 'change', { value: 'Promoted issue' });
    host!.press(host!.byText('Promote draft')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_issue'), { what: 'promoted draft' });
    expect(host!.calls.find(call => call.tool === 'update_issue')?.input).toMatchObject({ id: 'i3', title: 'Promoted issue', state: 'todo', draft: false, inbox: 'none' });

    host!.stop(); host = null;
    await open();
    await section('archive', 'Archived issues');
    host!.press(host!.byText('Restore issue')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_issue'), { what: 'restored issue' });
    expect(host!.calls.find(call => call.tool === 'update_issue')?.input).toEqual({ id: 'i4', version: 1, archived: false });
  });
});
