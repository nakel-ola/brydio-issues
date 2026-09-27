import { build } from '@brydio/cli';
import { FakeHost, type TreeNode } from '@brydio/fake-host';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HandlerClient, HandlerRecord } from '@brydio/app/handler';

import bulkIssues from '../src/handlers/bulk-issues.ts';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
const entry = join(root, 'dist/screens/plan.js');
const PROJECT = 'project_alpha';
const STATES = [
  { id: 'backlog', name: 'Backlog', project: PROJECT, group: 'backlog', colour: 'neutral', position: 0 },
  { id: 'todo', name: 'To do', project: PROJECT, group: 'unstarted', colour: 'neutral', position: 1024 },
  { id: 'doing', name: 'In progress', project: PROJECT, group: 'started', colour: 'brand', position: 2048 },
  { id: 'done', name: 'Done', project: PROJECT, group: 'completed', colour: 'success', position: 3072 },
];
const ISSUES = [
  { id: 'i1', title: 'First task', project: PROJECT, sequence: 1, state: 'todo', priority: 'high', assignees: ['user_ada'], labels: ['label_bug'], modules: ['module_core'], sprint: 'sprint_one', creator: 'user_ada', start: '2026-09-01', target: '2026-09-05', archived: false, draft: false, rank: 1024 },
  { id: 'i2', title: 'Second task', project: PROJECT, sequence: 2, state: 'doing', priority: 'medium', assignees: ['user_bo'], labels: ['label_feature'], modules: ['module_other'], sprint: 'sprint_two', creator: 'user_bo', start: '2026-10-01', target: '2026-10-05', archived: false, draft: false, rank: 1024 },
];
let host: FakeHost | null = null;

beforeAll(async () => {
  expect((await build(root)).problems.filter(problem => problem.severity === 'error')).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

async function open(options: Partial<Parameters<typeof FakeHost.start>[0]> = {}) {
  host = FakeHost.start({
    entry,
    manifest,
    context: { placement: { id: 'place_list', kind: 'project-tab', projectId: PROJECT } },
    directory: {
      projects: [{ id: PROJECT, name: 'Alpha project' }],
      members: [{ id: 'user_ada', name: 'Ada Lovelace' }, { id: 'user_bo', name: 'Bo Diddley' }],
    },
    fixtures: {
      issues: ISSUES,
      states: STATES,
      labels: [{ id: 'label_bug', name: 'Bug', colour: 'danger', project: PROJECT }, { id: 'label_feature', name: 'Feature', colour: 'brand', project: PROJECT }],
      sprints: [{ id: 'sprint_one', name: 'Sprint 1', status: 'active', project: PROJECT }, { id: 'sprint_two', name: 'Sprint 2', status: 'draft', project: PROJECT }],
      modules: [{ id: 'module_core', name: 'Core', status: 'started', project: PROJECT }, { id: 'module_other', name: 'Other', status: 'planned', project: PROJECT }],
      project_plan: [],
    },
    ...options,
  });
  await host.mounted();
  await host.waitFor(() => host!.byText('First task'), { what: 'the issue list' });
  await host.waitFor(
    () => host!.findAll(node => node.type === 'bry-list-row' && node.props.title === 'First task')[0]?.props.description === 'ALPH-1',
    { what: 'the project issue identifier' },
  );
}

function above(node: TreeNode | undefined, type: string): TreeNode | undefined {
  let current = node && host!.parentOf(node);

  while (current && current.type !== type) current = host!.parentOf(current);

  return current;
}

describe('the Plan issue collection', () => {
  test('groups the List by workflow state and quick-adds the next project issue', async () => {
    await open();

    expect(host!.byText('To do')).toBeTruthy();
    expect(host!.byText('In progress')).toBeTruthy();
    expect(host!.findAll(node => node.type === 'bry-list-row' && node.props.title === 'First task')[0]?.props.description).toBe('ALPH-1');

    host!.press(host!.byText('Quick add')!);
    const title = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input' && node.props.label === 'Title')[0], { what: 'the issue title' });

    host!.raise('bry-input', title, 'change', { value: 'Third task' });
    host!.raise('bry-input', title, 'submit', { value: 'Third task' });
    await host!.waitFor(() => host!.byText('Third task'), { what: 'the created issue' });

    expect(host!.calls.find(call => call.tool === 'create_issue')?.input).toMatchObject({
      title: 'Third task', project: PROJECT, sequence: 3, state: 'todo', assignees: [], labels: [], modules: [], rank: 2048,
    });
    expect(host!.findAll(node => node.type === 'bry-list-row' && node.props.description === 'ALPH-3')).toHaveLength(1);
  });

  test('creates a fully described issue with its chosen planning fields', async () => {
    await open();

    host!.press(host!.byText('New issue')!);
    const title = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input' && node.props.label === 'Title')[0], { what: 'the full issue form' });
    const description = host!.findAll(node => node.type === 'bry-textarea' && node.props.label === 'Description')[0]!;
    const state = host!.findAll(node => node.type === 'bry-select' && node.props.label === 'State')[0]!;
    const priority = host!.findAll(node => node.type === 'bry-select' && node.props.label === 'Priority')[0]!;
    const target = host!.findAll(node => node.type === 'bry-date' && node.props.label === 'Target date')[0]!;

    host!.raise('bry-input', title, 'change', { value: 'Ship the release' });
    host!.raise('bry-textarea', description, 'change', { value: 'Verify every release gate.' });
    host!.raise('bry-select', state, 'change', { value: 'doing' });
    host!.raise('bry-select', priority, 'change', { value: 'urgent' });
    host!.raise('bry-date', target, 'change', { value: '2026-10-01' });
    host!.press(host!.byText('Add issue')!);
    await host!.waitFor(() => host!.byText('Ship the release'), { what: 'the full issue' });

    expect(host!.calls.find(call => call.tool === 'create_issue')?.input).toMatchObject({
      title: 'Ship the release', description: 'Verify every release gate.', project: PROJECT,
      sequence: 3, state: 'doing', priority: 'urgent', target: '2026-10-01', rank: 2048,
    });
  });

  test('moves a Kanban card with state and rank in one versioned write', async () => {
    await open();

    const layouts = host!.findAll(node => node.type === 'bry-toggle-group' && node.props.label === 'Layout')[0]!;
    host!.raise('bry-toggle-group', layouts, 'change', { values: ['kanban'] });
    const board = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-board')[0], { what: 'Kanban' });
    const cardText = host!.findAll(node => node.type === 'bry-text' && node.props.text === 'First task')[0]!;
    const card = above(cardText, 'bry-card')!;
    const from = above(card, 'bry-board-column')!;
    const to = host!.findAll(node => node.type === 'bry-board-column' && node.props.title === 'In progress')[0]!;

    host!.event(board.id, 'move', { card: card.id, from: from.id, to: to.id, position: 1 });
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_issue'), { what: 'the move' });

    expect(host!.calls.find(call => call.tool === 'update_issue')?.input).toEqual({
      id: 'i1', version: 1, state: 'doing', rank: 2048,
    });
  });

  test('refuses a failed Kanban move and leaves the stored issue in place', async () => {
    await open({
      tools: {
        update_issue: () => ({
          isError: true,
          content: [{ type: 'text', text: 'The move was refused.' }],
          structuredContent: { error: 'refused' },
        }),
      },
    });

    const layouts = host!.findAll(node => node.type === 'bry-toggle-group' && node.props.label === 'Layout')[0]!;
    host!.raise('bry-toggle-group', layouts, 'change', { values: ['kanban'] });
    const board = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-board')[0], { what: 'Kanban' });
    const cardText = host!.findAll(node => node.type === 'bry-text' && node.props.text === 'First task')[0]!;
    const card = above(cardText, 'bry-card')!;
    const from = above(card, 'bry-board-column')!;
    const to = host!.findAll(node => node.type === 'bry-board-column' && node.props.title === 'In progress')[0]!;

    host!.event(board.id, 'move', { card: card.id, from: from.id, to: to.id, position: 1 });
    await host!.waitFor(() => host!.findAll(node => node.type === 'bry-alert' && node.props.tone === 'danger')[0], { what: 'the rejected move' });

    expect(host!.store!.records('issues').find(issue => issue.id === 'i1')).toMatchObject({ state: 'todo', version: 1 });
    expect(host!.findAll(node => node.type === 'bry-board')[0]?.props.settled).toBe(card.id);
    expect(host!.findAll(node => node.type === 'bry-alert' && node.props.tone === 'danger')).toHaveLength(1);
  });

  test('uses one filtered issue set across all five layouts and both calendar ranges', async () => {
    await open();
    const state = host!.findAll(node => node.type === 'bry-select' && node.props.label === 'Filter state')[0]!;
    host!.raise('bry-select', state, 'change', { value: 'todo' });
    await host!.waitFor(() => host!.byText('Second task') === undefined, { what: 'the state filter' });

    const setLayout = async (layout: string, ready: () => unknown) => {
      const control = host!.findAll(node => node.type === 'bry-toggle-group' && node.props.label === 'Layout')[0]!;
      host!.raise('bry-toggle-group', control, 'change', { values: [layout] });
      await host!.waitFor(ready, { what: `${layout} layout` });
      expect(host!.findAll(node => JSON.stringify(node.props).includes('ALPH-1')).length).toBeGreaterThan(0);
      expect(host!.findAll(node => JSON.stringify(node.props).includes('ALPH-2'))).toHaveLength(0);
    };

    await setLayout('list', () => host!.findAll(node => node.type === 'bry-list-row' && node.props.title === 'First task')[0]);
    await setLayout('kanban', () => host!.findAll(node => node.type === 'bry-board')[0]);
    await setLayout('calendar', () => host!.findAll(node => node.type === 'bry-calendar')[0]);
    const range = host!.findAll(node => node.type === 'bry-toggle-group' && node.props.label === 'Calendar range')[0]!;
    expect(range.props.values).toEqual(['month']);
    host!.raise('bry-toggle-group', range, 'change', { values: ['week'] });
    expect(await host!.waitFor(() => host!.byText('Week schedule'), { what: 'week mode' })).toBeTruthy();
    await setLayout('gantt', () => host!.findAll(node => node.type === 'bry-data-table' && node.props.label === 'Issue timeline')[0]);
    await setLayout('spreadsheet', () => host!.findAll(node => node.type === 'bry-data-table' && node.props.label === 'Issue spreadsheet')[0]);

    const properties = host!.findAll(node => node.type === 'bry-toggle-group' && node.props.label === 'Visible properties')[0]!;
    host!.raise('bry-toggle-group', properties, 'change', { values: ['identifier', 'state'] });
    const table = await host!.waitFor(
      () => host!.findAll(node => node.type === 'bry-data-table' && node.props.label === 'Issue spreadsheet' && !(node.props.columns as { key: string }[]).some(column => column.key === 'priority'))[0],
      { what: 'the hidden spreadsheet property' },
    );
    expect((table.props.columns as { key: string }[]).map(column => column.key)).toEqual(['issue', 'state']);
  });

  test('applies member, label, sprint, module, creator, and date filters and can hide sub-issues', async () => {
    await open({ fixtures: {
      issues: [...ISSUES, { ...ISSUES[0], id: 'i3', sequence: 3, title: 'Child task', parent: 'i1' }],
      states: STATES,
      labels: [{ id: 'label_bug', name: 'Bug', colour: 'danger', project: PROJECT }, { id: 'label_feature', name: 'Feature', colour: 'brand', project: PROJECT }],
      sprints: [{ id: 'sprint_one', name: 'Sprint 1', status: 'active', project: PROJECT }, { id: 'sprint_two', name: 'Sprint 2', status: 'draft', project: PROJECT }],
      modules: [{ id: 'module_core', name: 'Core', status: 'started', project: PROJECT }, { id: 'module_other', name: 'Other', status: 'planned', project: PROJECT }],
      project_plan: [],
    } });

    const change = (label: string, value: string, type = 'bry-select') => {
      const control = host!.findAll(node => node.type === type && node.props.label === label)[0]!;
      host!.event(control, 'change', { value });
    };
    change('Filter assignee', 'user_ada');
    change('Filter label', 'label_bug');
    change('Filter sprint', 'sprint_one');
    change('Filter module', 'module_core');
    change('Filter creator', 'user_ada');
    change('Start through', '2026-09-30', 'bry-date');
    change('Target through', '2026-09-30', 'bry-date');
    await host!.waitFor(() => host!.byText('Second task') === undefined, { what: 'the complete filters' });
    expect(host!.byText('Child task')).toBeTruthy();

    const display = host!.findAll(node => node.type === 'bry-toggle' && node.props.label === 'Show sub-issues')[0]!;
    host!.raise('bry-toggle', display, 'change', { pressed: false });
    await host!.waitFor(() => host!.byText('Child task') === undefined, { what: 'hidden sub-issues' });
    const empty = host!.findAll(node => node.type === 'bry-toggle' && node.props.label === 'Show empty groups')[0]!;
    host!.raise('bry-toggle', empty, 'change', { pressed: true });
    expect(await host!.waitFor(() => host!.findAll(node => node.type === 'bry-item' && node.props.title === 'Done')[0], { what: 'empty state group' })).toBeTruthy();
  });

  test('selects the visible set for bulk update, archive, and delete', async () => {
    await open({ tools: { bulk_issues: () => ({ content: [{ type: 'text', text: 'Done.' }], structuredContent: { updated: 2, archived: 0, deleted: 0 } }) } });
    let count = 0;
    const call = async (label: string) => {
      host!.press(host!.byText('Select visible')!);
      host!.press(await host!.waitFor(() => host!.byText(label), { what: label }));
      count += 1;
      await host!.waitFor(() => host!.calls.filter(one => one.tool === 'bulk_issues').length === count && host!.byText('Select visible'), { what: 'bulk action' });
    };

    await call('Set high priority');
    await call('Archive selected');
    await call('Delete selected');
    expect(host!.calls.filter(one => one.tool === 'bulk_issues').map(one => one.input)).toEqual([
      { project: PROJECT, action: 'update', ids: ['i1', 'i2'], fields: '{"priority":"high"}' },
      { project: PROJECT, action: 'archive', ids: ['i1', 'i2'] },
      { project: PROJECT, action: 'delete', ids: ['i1', 'i2'] },
    ]);
  });
});

describe('the bounded bulk issue handler', () => {
  const records: HandlerRecord[] = [
    { id: 'i1', version: 4, project: PROJECT },
    { id: 'i2', version: 7, project: PROJECT },
    { id: 'foreign', version: 1, project: 'project_beta' },
  ];
  const client = (batches: unknown[][]) => ({
    data: {
      get: async (_collection: string, id: string) => records.find(one => one.id === id)!,
      batch: async (_collection: string, changes: unknown[]) => { batches.push(changes); return []; },
    },
  } as unknown as HandlerClient);

  test('uses current versions and returns literal update, archive, and delete counts', async () => {
    const batches: unknown[][] = [];
    expect(await bulkIssues({ project: PROJECT, action: 'update', ids: ['i1', 'i2'], fields: '{"priority":"urgent"}' }, client(batches))).toEqual({ updated: 2, archived: 0, deleted: 0 });
    expect(await bulkIssues({ project: PROJECT, action: 'archive', ids: ['i1'] }, client(batches))).toEqual({ updated: 0, archived: 1, deleted: 0 });
    expect(await bulkIssues({ project: PROJECT, action: 'delete', ids: ['i2'] }, client(batches))).toEqual({ updated: 0, archived: 0, deleted: 1 });
    expect(batches).toEqual([
      [
        { op: 'update', id: 'i1', version: 4, fields: { priority: 'urgent' } },
        { op: 'update', id: 'i2', version: 7, fields: { priority: 'urgent' } },
      ],
      [{ op: 'update', id: 'i1', version: 4, fields: { archived: true } }],
      [{ op: 'delete', id: 'i2', version: 7 }],
    ]);
  });

  test('rejects duplicates, oversized sets, and cross-project records before a write', async () => {
    const batches: unknown[][] = [];
    expect(bulkIssues({ project: PROJECT, action: 'delete', ids: ['i1', 'i1'] }, client(batches))).rejects.toThrow('only once');
    expect(bulkIssues({ project: PROJECT, action: 'delete', ids: Array.from({ length: 101 }, (_, index) => `i${index}`) }, client(batches))).rejects.toThrow('at most 100');
    expect(bulkIssues({ project: PROJECT, action: 'archive', ids: ['foreign'] }, client(batches))).rejects.toThrow('this project');
    expect(batches).toEqual([]);
  });
});
