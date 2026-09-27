import { build } from '@brydio/cli';
import { FakeHost, type TreeNode } from '@brydio/fake-host';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  { id: 'i1', title: 'First task', project: PROJECT, sequence: 1, state: 'todo', priority: 'high', assignees: [], labels: [], modules: [], archived: false, draft: false, rank: 1024 },
  { id: 'i2', title: 'Second task', project: PROJECT, sequence: 2, state: 'doing', priority: 'medium', assignees: [], labels: [], modules: [], archived: false, draft: false, rank: 1024 },
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
    directory: { projects: [{ id: PROJECT, name: 'Alpha project' }] },
    fixtures: { issues: ISSUES, states: STATES, labels: [], sprints: [], modules: [], project_plan: [] },
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

    const tabs = host!.findAll(node => node.type === 'bry-tabs')[0]!;
    host!.raise('bry-tabs', tabs, 'change', { id: 'kanban' });
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

    const tabs = host!.findAll(node => node.type === 'bry-tabs')[0]!;
    host!.raise('bry-tabs', tabs, 'change', { id: 'kanban' });
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
});
