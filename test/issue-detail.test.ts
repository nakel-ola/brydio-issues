import { build } from '@brydio/cli';
import { FakeHost, type TreeNode } from '@brydio/fake-host';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HandlerClient, HandlerRecord } from '@brydio/app/handler';

import manageRelations from '../src/handlers/relations.ts';
import toggleIssueSignal from '../src/handlers/issue-signals.ts';

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
  }, {
    id: 'i2', title: 'Second task', description: '', project: PROJECT, sequence: 2,
    state: 'todo', priority: 'medium', assignees: [], labels: [], modules: [],
    archived: false, draft: false, rank: 2048,
  }],
  states: [
    { id: 'todo', name: 'To do', project: PROJECT, group: 'unstarted', colour: 'neutral', position: 1024 },
    { id: 'doing', name: 'In progress', project: PROJECT, group: 'started', colour: 'brand', position: 2048 },
  ],
  labels: [{ id: 'label_bug', name: 'Bug', colour: 'danger', project: PROJECT }],
  sprints: [{ id: 'sprint_one', name: 'Sprint 1', project: PROJECT, status: 'active' }],
  modules: [{ id: 'module_core', name: 'Core', project: PROJECT, status: 'started' }],
  comments: [{ id: 'c1', issue: 'i1', project: PROJECT, body: 'First comment', author: 'user_ada', edited: false }],
  reactions: [],
  attachments: [{ id: 'a1', issue: 'i1', project: PROJECT, file_id: 'file_existing', name: 'brief.pdf', size: 1200, mime: 'application/pdf' }],
  links: [{ id: 'l1', issue: 'i1', project: PROJECT, title: 'Specification', url: 'https://example.com/spec' }],
  relations: [],
  subscriptions: [],
  votes: [],
  activity: [{ id: 'act1', issue: 'i1', project: PROJECT, actor: 'user_ada', action: 'created the issue', detail: 'From Plan' }],
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

  test('creates, replies to, edits, and deletes sanitized comments', async () => {
    await open();
    const comment = of('bry-textarea', 'Comment')!;
    host!.raise('bry-textarea', comment, 'change', { value: '<b>Useful update</b>' });
    host!.press(host!.byText('Add comment')!);
    await host!.waitFor(() => host!.calls.filter(call => call.tool === 'create_comment').length === 1, { what: 'the comment' });
    expect(host!.calls.find(call => call.tool === 'create_comment')?.input).toMatchObject({ issue: 'i1', project: PROJECT, body: 'Useful update' });

    host!.press(host!.byText('Reply')!);
    const reply = await host!.waitFor(() => of('bry-textarea', 'Reply'), { what: 'the reply editor' });
    host!.raise('bry-textarea', reply, 'change', { value: 'Following up' });
    host!.press(host!.byText('Add reply')!);
    await host!.waitFor(() => host!.calls.filter(call => call.tool === 'create_comment').length === 2, { what: 'the reply' });
    expect(host!.calls.filter(call => call.tool === 'create_comment')[1]?.input).toMatchObject({ parent: 'c1', body: 'Following up' });

    host!.press(host!.byText('Edit comment')!);
    const editor = await host!.waitFor(() => of('bry-textarea', 'Edit comment'), { what: 'the comment editor' });
    host!.raise('bry-textarea', editor, 'change', { value: 'Edited comment' });
    host!.press(host!.byText('Save comment')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_comment'), { what: 'the edited comment' });
    expect(host!.calls.find(call => call.tool === 'update_comment')?.input).toMatchObject({ id: 'c1', version: 1, body: 'Edited comment', edited: true });

    host!.press(host!.byText('Delete comment')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'delete_comment'), { what: 'the deleted comment' });
  });

  test('toggles collaboration signals and exposes literal detail counts', async () => {
    await open('i1', { tools: {
      toggle_issue_signal: () => ({ content: [{ type: 'text', text: 'Toggled.' }], structuredContent: { active: true } }),
    } });
    const tabs = host!.findAll(node => node.type === 'bry-tabs' && node.props.label === 'Issue details')[0]!;
    expect(tabs.props.tabs).toEqual([
      { id: 'activity', label: 'Activity · 1' }, { id: 'comments', label: 'Comments · 1' },
      { id: 'subissues', label: 'Sub-issues · 0' }, { id: 'relations', label: 'Relations · 0' },
      { id: 'attachments', label: 'Attachments · 1' }, { id: 'links', label: 'Links · 1' },
    ]);

    host!.press(host!.byText('Vote · 0')!);
    await host!.waitFor(() => host!.calls.filter(call => call.tool === 'toggle_issue_signal').length === 1);
    host!.press(host!.byText('Subscribe · 0')!);
    await host!.waitFor(() => host!.calls.filter(call => call.tool === 'toggle_issue_signal').length === 2);
    host!.press(host!.byText('👍 0')!);
    await host!.waitFor(() => host!.calls.filter(call => call.tool === 'toggle_issue_signal').length === 3);
    expect(host!.calls.filter(call => call.tool === 'toggle_issue_signal').map(call => call.input)).toEqual([
      { project: PROJECT, issue: 'i1', action: 'vote' },
      { project: PROJECT, issue: 'i1', action: 'subscribe' },
      { project: PROJECT, issue: 'i1', action: 'react', emoji: '👍' },
    ]);
  });

  test('creates sub-issues, paired relations, project-file attachments, and external links', async () => {
    await open('i1', {
      tools: { manage_relations: () => ({ content: [{ type: 'text', text: 'Related.' }], structuredContent: { related: true } }) },
      api: async call => call.action === 'files.list'
        ? [{ id: 'file_new', name: 'research.pdf', kind: 'pdf', status: 'ready', size: 2400, createdAt: '2026-09-20' }]
        : [],
    });

    const sub = of('bry-input', 'Sub-issue title')!;
    host!.raise('bry-input', sub, 'change', { value: 'Child task' });
    host!.press(host!.byText('Add sub-issue')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'create_issue'), { what: 'the sub-issue' });
    expect(host!.calls.find(call => call.tool === 'create_issue')?.input).toMatchObject({ title: 'Child task', parent: 'i1', project: PROJECT, sequence: 3 });

    host!.press(host!.byText('Add relation')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'manage_relations'), { what: 'the relation' });
    expect(host!.calls.find(call => call.tool === 'manage_relations')?.input).toEqual({ project: PROJECT, issue: 'i1', target: 'i2', kind: 'relates' });

    const files = await host!.waitFor(() => {
      const control = of('bry-select', 'Project file');
      return (control?.props.options as { value: string }[] | undefined)?.some(one => one.value === 'file_new') ? control : undefined;
    }, { what: 'project files' });
    host!.raise('bry-select', files, 'change', { value: 'file_new' });
    host!.press(host!.byText('Attach project file')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'create_attachment'), { what: 'the attachment' });
    expect(host!.calls.find(call => call.tool === 'create_attachment')?.input).toMatchObject({ issue: 'i1', project: PROJECT, file_id: 'file_new', name: 'research.pdf', size: 2400 });

    host!.raise('bry-input', of('bry-input', 'Link title')!, 'change', { value: 'Design notes' });
    host!.raise('bry-input', of('bry-input', 'URL')!, 'change', { value: 'https://example.com/design' });
    host!.press(host!.byText('Add link')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'create_link'), { what: 'the link' });
    expect(host!.calls.find(call => call.tool === 'create_link')?.input).toEqual({ issue: 'i1', project: PROJECT, title: 'Design notes', url: 'https://example.com/design' });

    const attachment = host!.findAll(node => node.type === 'bry-attachment' && node.props.name === 'brief.pdf')[0]!;
    host!.raise('bry-attachment', attachment, 'open');
    await host!.waitFor(() => host!.received.some(message => message.method === 'ui/navigate' && JSON.stringify(message.params).includes('file_existing')), { what: 'the opened attachment' });
    host!.raise('bry-attachment', attachment, 'remove');
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'delete_attachment'), { what: 'the removed attachment' });

    host!.press(host!.byText('Edit link')!);
    await host!.waitFor(() => host!.byText('Save link'), { what: 'the link editor' });
    host!.raise('bry-input', of('bry-input', 'Link title')!, 'change', { value: 'Updated specification' });
    host!.press(host!.byText('Save link')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_link'), { what: 'the updated link' });
    expect(host!.calls.find(call => call.tool === 'update_link')?.input).toMatchObject({ version: 1, title: 'Updated specification' });
    host!.press(host!.byText('Delete link')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'delete_link'), { what: 'the deleted link' });
  });

  test('prepares share values, archives, and deletes through versioned writes', async () => {
    await open();
    host!.press(host!.byText('Copy issue link')!);
    expect(await host!.waitFor(() => of('bry-input', 'Issue link')?.props.value, { what: 'the issue link' })).toBe('brydio://plan/issues/i1');
    host!.press(host!.byText('Close')!);
    host!.press(host!.byText('Copy branch name')!);
    expect(await host!.waitFor(() => of('bry-input', 'Branch name')?.props.value, { what: 'the branch name' })).toBe('plan/alph-1-first-task');
    host!.press(host!.byText('Close')!);

    host!.press(host!.byText('Archive issue')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'update_issue' && call.input.archived === true), { what: 'archive' });
    host!.press(host!.byText('Delete issue')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'delete_issue'), { what: 'delete' });
    expect(host!.calls.find(call => call.tool === 'delete_issue')?.input).toEqual({ id: 'i1', version: 2 });
  });
});

describe('Plan relation and signal handlers', () => {
  test('creates and removes inverse relation pairs', async () => {
    const rows: HandlerRecord[] = [];
    const created: Record<string, unknown>[] = [];
    const removed: string[] = [];
    const client = { data: {
      list: async (_collection: string, query: { filter?: Record<string, unknown> } = {}) => ({
        items: rows.filter(row => Object.entries(query.filter ?? {}).every(([key, value]) => row[key] === value)), nextCursor: null,
      }),
      create: async (_collection: string, fields: Record<string, unknown>) => {
        const row = { id: `r${rows.length + 1}`, version: 1, ...fields }; rows.push(row); created.push(fields); return row;
      },
      remove: async (_collection: string, id: string) => { removed.push(id); return { removed: id }; },
    } } as unknown as HandlerClient;

    expect(await manageRelations({ project: PROJECT, issue: 'i1', target: 'i2', kind: 'blocks' }, client)).toEqual({ related: true });
    expect(created).toEqual([
      { project: PROJECT, issue: 'i1', target: 'i2', kind: 'blocks' },
      { project: PROJECT, issue: 'i2', target: 'i1', kind: 'blocked_by' },
    ]);
    expect(await manageRelations({ project: PROJECT, issue: 'i1', target: 'i2', kind: 'blocks', remove: true }, client)).toEqual({ removed: 2 });
    expect(removed).toEqual(['r1', 'r2']);
  });

  test('uses the handler caller to enforce one signal per member and emoji', async () => {
    const rows: HandlerRecord[] = [];
    const client = { caller: { userId: 'user_ada', origin: 'screen' }, data: {
      list: async (collection: string, query: { filter?: Record<string, unknown> } = {}) => ({
        items: rows.filter(row => row.collection === collection && Object.entries(query.filter ?? {}).every(([key, value]) => row[key] === value)), nextCursor: null,
      }),
      create: async (collection: string, fields: Record<string, unknown>) => {
        const row = { id: `s${rows.length + 1}`, version: 1, collection, ...fields }; rows.push(row); return row;
      },
      remove: async (_collection: string, id: string) => { const at = rows.findIndex(row => row.id === id); if (at >= 0) rows.splice(at, 1); return { removed: id }; },
    } } as unknown as HandlerClient;

    expect(await toggleIssueSignal({ project: PROJECT, issue: 'i1', action: 'react', emoji: '👍' }, client)).toEqual({ active: true, created: 1 });
    expect(rows[0]).toMatchObject({ member: 'user_ada', emoji: '👍' });
    expect(await toggleIssueSignal({ project: PROJECT, issue: 'i1', action: 'react', emoji: '👍' }, client)).toEqual({ active: false, removed: 1 });
    expect(rows).toEqual([]);
    expect(await toggleIssueSignal({ project: PROJECT, issue: 'i1', action: 'vote' }, client)).toEqual({ active: true, created: 1 });
    expect(await toggleIssueSignal({ project: PROJECT, issue: 'i1', action: 'vote' }, client)).toEqual({ active: false, removed: 1 });
    expect(await toggleIssueSignal({ project: PROJECT, issue: 'i1', action: 'subscribe' }, client)).toEqual({ active: true, created: 1 });
  });
});
