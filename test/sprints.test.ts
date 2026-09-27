import { build } from '@brydio/cli';
import { FakeHost, type TreeNode } from '@brydio/fake-host';
import type { HandlerClient, HandlerRecord } from '@brydio/app/handler';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import createSprint from '../src/handlers/create-sprint.ts';
import sprintChildren, { sprintFolderRows } from '../src/handlers/sprint-children.ts';
import { orderedSprints } from '../src/features/sprints/sprints.tsx';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
const entry = join(root, 'dist/screens/sprint.js');
const PROJECT = 'project_alpha';
const STATES = [
  { id: 'todo', name: 'To do', project: PROJECT, group: 'unstarted', colour: 'neutral', position: 1024 },
  { id: 'done', name: 'Done', project: PROJECT, group: 'completed', colour: 'success', position: 2048 },
];
const SPRINTS = [
  { id: 'active', name: 'Active sprint', project: PROJECT, status: 'active', start: '2026-09-20', end: '2026-10-01', goal: 'Ship Plan' },
  { id: 'upcoming', name: 'Upcoming sprint', project: PROJECT, status: 'active', start: '2026-10-02', end: '2026-10-15' },
  { id: 'draft', name: 'Draft sprint', project: PROJECT, status: 'draft' },
  { id: 'completed', name: 'Completed sprint', project: PROJECT, status: 'completed', start: '2026-09-01', end: '2026-09-14' },
];
const ISSUES = [
  { id: 'i1', title: 'Open task', project: PROJECT, sequence: 1, state: 'todo', priority: 'high', assignees: [], labels: [], modules: [], sprint: 'active', archived: false, draft: false, rank: 1024 },
  { id: 'i2', title: 'Finished task', project: PROJECT, sequence: 2, state: 'done', priority: 'medium', assignees: [], labels: [], modules: [], sprint: 'active', archived: false, draft: false, rank: 2048 },
  { id: 'i3', title: 'Unplanned task', project: PROJECT, sequence: 3, state: 'todo', priority: 'none', assignees: [], labels: [], modules: [], archived: false, draft: false, rank: 3072 },
];
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

async function open(options: Partial<Parameters<typeof FakeHost.start>[0]> = {}) {
  host = FakeHost.start({
    entry,
    manifest,
    context: { placement: { id: 'place_sprint', kind: 'project-tab', projectId: PROJECT } },
    directory: { projects: [{ id: PROJECT, name: 'Alpha project' }] },
    fixtures: { issues: ISSUES, labels: [], states: STATES, sprints: SPRINTS, modules: [] },
    ...options,
  });
  await host.mounted();
}

describe('Plan sprints', () => {
  test('orders literal phases and opens the active sprint with progress by default', async () => {
    expect(orderedSprints(SPRINTS as never, '2026-09-27').map(one => one.id)).toEqual(['active', 'upcoming', 'draft', 'completed']);
    await open();
    expect(await host!.waitFor(() => of('bry-heading', 'Active sprint'), { what: 'the active sprint' })).toBeTruthy();
    expect(host!.byText('1 of 2 issues completed')).toBeTruthy();
    expect(of('bry-progress', 'Sprint progress')?.props.value).toBe(50);
    expect(host!.byText('Ship Plan')).toBeTruthy();
  });

  test('a selected folder row opens that sprint and an unavailable selection falls back to the list', async () => {
    await open({ context: {
      placement: { id: 'place_sprint', kind: 'project-tab', projectId: PROJECT },
      selection: { kind: 'item', id: 'completed' },
    } });
    expect(await host!.waitFor(() => of('bry-heading', 'Completed sprint'), { what: 'the selected sprint' })).toBeTruthy();

    host!.stop();
    host = null;
    await open({ context: {
      placement: { id: 'place_sprint', kind: 'project-tab', projectId: PROJECT },
      selection: { kind: 'item', id: 'missing' },
    } });
    expect(await host!.waitFor(() => host!.byText('That sprint is unavailable'), { what: 'the sprint list fallback' })).toBeTruthy();
    expect(host!.byText('Active sprint')).toBeTruthy();
  });

  test('shows the list when there is no active sprint and creates a draft sprint', async () => {
    const inactive = SPRINTS.filter(one => one.id !== 'active');
    await open({ fixtures: { issues: ISSUES, labels: [], states: STATES, sprints: inactive, modules: [] } });
    expect(await host!.waitFor(() => of('bry-heading', 'Sprints'), { what: 'the sprint list' })).toBeTruthy();
    const headings = host!.findAll(node => node.type === 'bry-heading' && node.props.level === 3).map(node => node.props.text);
    expect(headings).toEqual(['Upcoming sprint', 'Draft sprint', 'Completed sprint']);

    host!.press(host!.byText('New sprint')!);
    const name = await host!.waitFor(() => of('bry-input', 'Sprint name'), { what: 'the sprint form' });
    host!.raise('bry-input', name, 'change', { value: 'Sprint 42' });
    host!.press(host!.byText('Create sprint')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'create_sprint'), { what: 'the new sprint' });
    expect(host!.calls.find(call => call.tool === 'create_sprint')?.input).toMatchObject({ name: 'Sprint 42', project: PROJECT, status: 'draft' });
  });

  test('adds and removes existing issues while the shared renderer stays sprint-scoped', async () => {
    await open();
    await host!.waitFor(() => of('bry-heading', 'Active sprint'), { what: 'the sprint detail' });
    const picker = of('bry-select', 'Add existing issue')!;
    host!.raise('bry-select', picker, 'change', { value: 'i3' });
    host!.press(host!.byText('Add to sprint')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_issue' && call.input.sprint === 'active'), { what: 'the added issue' });
    expect(host!.calls.find(call => call.tool === 'update_issue' && call.input.sprint === 'active')?.input).toEqual({ id: 'i3', version: 1, sprint: 'active' });

    host!.press(host!.byText('Remove from sprint')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_issue' && call.input.sprint === null), { what: 'the removed issue' });
    expect(host!.byText('Sprint issues')).toBeTruthy();
    expect(await host!.waitFor(() => host!.byText('Unplanned task'), { what: 'the shared sprint issue renderer' })).toBeTruthy();
  });

  test('keeps foreign project sprints and issues out of the placement', async () => {
    await open({ fixtures: {
      issues: [...ISSUES, { ...ISSUES[0], id: 'foreign_issue', project: 'project_beta', title: 'Foreign issue' }],
      labels: [], states: STATES,
      sprints: [...SPRINTS, { ...SPRINTS[0], id: 'foreign_sprint', project: 'project_beta', name: 'Foreign sprint' }],
      modules: [],
    } });
    await host!.waitFor(() => of('bry-heading', 'Active sprint'), { what: 'the project sprint' });
    expect(host!.byText('Foreign sprint')).toBeUndefined();
    expect(host!.byText('Foreign issue')).toBeUndefined();
  });
});

describe('Sprint folder handlers', () => {
  test('returns only the folder contract in active, upcoming, draft, completed order', async () => {
    const records = SPRINTS.map((one, index) => ({ version: 1, ...one, secret: `hidden-${index}` })) as HandlerRecord[];
    expect(sprintFolderRows(records, '2026-09-27')).toEqual([
      { id: 'active', title: 'Active sprint', subtitle: '2026-09-20 – 2026-10-01', badge: 'active' },
      { id: 'upcoming', title: 'Upcoming sprint', subtitle: '2026-10-02 – 2026-10-15', badge: 'upcoming' },
      { id: 'draft', title: 'Draft sprint', subtitle: 'Draft sprint', badge: 'draft' },
      { id: 'completed', title: 'Completed sprint', subtitle: '2026-09-01 – 2026-09-14', badge: 'completed' },
    ]);

    const client = { data: { list: async (_collection: string, query: Record<string, unknown>) => {
      expect(query).toMatchObject({ filter: { project: PROJECT }, limit: 200 });
      return { items: records, nextCursor: null };
    } } } as unknown as HandlerClient;
    const answer = await sprintChildren({ project: PROJECT }, client) as { items: Record<string, unknown>[]; total: number };
    expect(answer.items.every(one => Object.keys(one).every(key => ['id', 'title', 'subtitle', 'badge'].includes(key)))).toBe(true);
    expect(answer.total).toBe(4);
  });

  test('creates a draft through the folder’s inherited project context', async () => {
    const calls: { tool: string; input?: Record<string, unknown> }[] = [];
    const client = { tools: { call: async (tool: string, input?: Record<string, unknown>) => {
      calls.push({ tool, input });
      return { id: 'sprint_new', version: 1, project: PROJECT, ...input };
    } } } as unknown as HandlerClient;

    expect(await createSprint({ name: '  Sprint 42  ' }, client)).toMatchObject({ id: 'sprint_new', name: 'Sprint 42', status: 'draft' });
    expect(calls).toEqual([{ tool: 'create_sprint', input: { name: 'Sprint 42', status: 'draft' } }]);
    expect(createSprint({ name: ' ' }, client)).rejects.toThrow('Give the sprint a name');
  });
});
