import { build } from '@brydio/cli';
import { FakeHost, type TreeNode } from '@brydio/fake-host';
import { validateManifest } from '@brydio/manifest';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
const board = join(root, 'dist/screens/board.js');

const FIXTURES = {
  issues: [
    { id: 'issue_login', title: 'Fix the login page', status: 'todo' },
    { id: 'issue_export', title: 'Export to CSV', status: 'doing', labels: ['data'] },
    { id: 'issue_docs', title: 'Write the help page', status: 'done', due: '2026-10-03' },
  ],
};

let host: FakeHost | null = null;

beforeAll(async () => {
  const built = await build(root);

  expect(built.problems).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

/** A card's title: the text in it, not a button that happens to say the same. */
const titled = (title: string) => host!.findAll(node => node.type === 'bry-text' && node.props.text === title)[0];

const boardNode = () => host!.findAll(node => node.type === 'bry-board')[0]!;

/** A column by its title. */
const column = (title: string) => host!.findAll(node => node.type === 'bry-board-column' && node.props.title === title)[0]!;

/** The nearest ancestor of this type. */
function above(node: TreeNode | undefined, type: string): TreeNode | undefined {
  let at = node && host!.parentOf(node);

  while (at && at.type !== type) at = host!.parentOf(at);

  return at;
}

/** The column a card sits in, by its title. */
const columnOf = (title: string) => above(titled(title), 'bry-board-column')?.props.title;

/** The card holding this title. */
const cardOf = (title: string) => above(titled(title), 'bry-card')!;

/** A person dropping a card in a column, as Brydio's board raises it. */
function drop(title: string, to: string, position = 0) {
  const card = cardOf(title);

  host!.event(boardNode().id, 'move', { card: card.id, from: above(card, 'bry-board-column')!.id, to: column(to).id, position });

  return card;
}

const errorLine = () => host!.waitFor(() => host!.findAll(node => node.type === 'bry-text' && node.props.tone === 'danger')[0], { what: 'the error line' });

function isInside(node: TreeNode, ancestor: TreeNode): boolean {
  for (let at = host!.parentOf(node); at; at = host!.parentOf(at)) if (at.id === ancestor.id) return true;

  return false;
}

async function open(options: Partial<Parameters<typeof FakeHost.start>[0]> = {}) {
  host = FakeHost.start({ entry: board, manifest, fixtures: FIXTURES, ...options });
  await host.mounted();
  await host.waitFor(() => host!.byText('Fix the login page'), { what: 'the issues to load' });
  // Every column read, and the cards' names, badges and menus joined after the first paint.
  await host.idle();

  return host;
}

test('the manifest is one Brydio’s server accepts', () => {
  expect(validateManifest(manifest)).toMatchObject({ ok: true, problems: [] });
  expect(manifest.version).toBe('0.11.9');
});

describe('the board', () => {
  test('draws Brydio’s board with three counted columns, each card in its status’s column, and watches the issues', async () => {
    await open();

    expect(boardNode().props).toMatchObject({ label: 'Issues', cardSize: 'lg' });
    // Loaded: Preact takes a false setting away rather than sending it.
    expect(boardNode().props.loading).toBeUndefined();
    expect(host!.findAll(node => node.type === 'bry-board-column').map(node => [node.props.title, node.props.count, node.props.empty])).toEqual([
      ['To do', 1, 'Nothing here.'],
      ['Doing', 1, 'Nothing here.'],
      ['Done', 1, 'Nothing here.'],
    ]);
    expect(columnOf('Fix the login page')).toBe('To do');
    expect(columnOf('Export to CSV')).toBe('Doing');
    expect(columnOf('Write the help page')).toBe('Done');
    // To do's first cards alone, then every column whole, To do again from its top.
    const byRank = { field: 'rank', dir: 'asc' };

    expect(host!.calls[0]!.input).toEqual({ filter: { status: 'todo' }, sort: byRank, limit: 12 });
    expect(host!.calls.slice(1, 4).map(call => [call.tool, call.input]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
      ['list_issues', { filter: { status: 'doing' }, sort: byRank, limit: 200 }],
      ['list_issues', { filter: { status: 'done' }, sort: byRank, limit: 200 }],
      ['list_issues', { filter: { status: 'todo' }, sort: byRank, limit: 200 }],
    ]);
    expect(host!.watching).toEqual(['issues']);
    // No arrows: the board's own drag and keyboard move a card.
    expect(host!.findAll(node => node.type === 'bry-button' && ['←', '→'].includes(String(node.props.label)))).toEqual([]);
    expect(host!.refusals).toEqual([]);
  });

  test('a card dropped in another column is written with update_issue { id, version, status }, and stays there', async () => {
    await open();

    drop('Fix the login page', 'Doing', 0);
    await host!.waitFor(() => columnOf('Fix the login page') === 'Doing', { what: 'the card to move' });

    // Above the one card in Doing, which has no rank: the first step.
    expect(host!.calls.filter(call => call.tool !== 'list_issues').map(call => [call.tool, call.input, call.asked])).toEqual([
      ['update_issue', { id: 'issue_login', version: 1, status: 'doing', rank: 1024 }, 'allow'],
    ]);
    expect(column('Doing').props.count).toBe(2);
    expect(column('To do').props.count).toBe(0);
    expect(host!.store!.records('issues').find(issue => issue.id === 'issue_login')).toMatchObject({ status: 'doing', version: 2 });
    // Confirmed by drawing it there, never refused.
    expect(boardNode().props.settled).toBeUndefined();

    // And back again, from the version it is at now.
    drop('Fix the login page', 'To do');
    await host!.waitFor(() => columnOf('Fix the login page') === 'To do', { what: 'the card to move back' });

    expect(host!.calls.filter(call => call.tool === 'update_issue').at(-1)).toMatchObject({ input: { id: 'issue_login', version: 2, status: 'todo', rank: 1024 } });
    expect(boardNode().props.settled).toBeUndefined();
    expect(host!.refusals).toEqual([]);
  });

  test('a move the person doesn’t allow puts the card back and says why on the error line', async () => {
    await open({ asks: 'deny' });

    const card = drop('Export to CSV', 'Done');
    const line = await errorLine();

    expect(line.props.text).toBe('Couldn’t move “Export to CSV”. The person didn’t allow it.');
    await host!.waitFor(() => boardNode().props.settled === card.id, { what: 'the card to be sent back' });
    expect(columnOf('Export to CSV')).toBe('Doing');
    expect(host!.store!.records('issues').find(issue => issue.id === 'issue_export')).toMatchObject({ status: 'doing', version: 1 });
  });

  test('a card dropped between two lands between them, in one write, and the next read draws it there', async () => {
    await open({
      fixtures: {
        issues: [
          { id: 'issue_a', title: 'First', status: 'todo', rank: 1024 },
          { id: 'issue_b', title: 'Second', status: 'todo', rank: 2048 },
          { id: 'issue_c', title: 'Third', status: 'todo' },
          { id: 'issue_login', title: 'Fix the login page', status: 'doing' },
        ],
      },
    });

    const order = (title: string) => host!.tree.get(column(title).id)!.children.map(id => host!.findAll(node => node.type === 'bry-text' && isInside(node, host!.tree.get(id)!))[0]!.props.text);

    // Ranked first, then the one without a rank.
    expect(order('To do')).toEqual(['First', 'Second', 'Third']);

    drop('Fix the login page', 'To do', 1);
    await host!.waitFor(() => order('To do').join() === 'First,Fix the login page,Second,Third', { what: 'the card between First and Second' });

    expect(host!.calls.filter(call => call.tool === 'update_issue').map(call => call.input)).toEqual([
      { id: 'issue_login', version: 1, status: 'todo', rank: 1536 },
    ]);

    // Within its own column, to the top: one step above the first.
    drop('Second', 'To do', 0);
    await host!.waitFor(() => order('To do').join() === 'Second,First,Fix the login page,Third', { what: 'Second at the top' });
    expect(host!.calls.filter(call => call.tool === 'update_issue').at(-1)!.input).toEqual({ id: 'issue_b', version: 1, rank: 0, status: 'todo' });

    // A new issue goes after the last ranked one in To do.
    host!.press(host!.byText('New issue')!);

    const field = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input')[0], { what: 'the title field' });

    host!.event(field.id, 'change', { value: 'Newest' });
    await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input')[0]?.props.value === 'Newest', { what: 'the typed title' });
    host!.event(field.id, 'submit', { value: 'Newest' });
    await host!.waitFor(() => order('To do').includes('Newest'), { what: 'the new issue' });
    expect(host!.calls.find(call => call.tool === 'create_issue')!.input).toMatchObject({ title: 'Newest', rank: 2560 });
    expect(order('To do')).toEqual(['Second', 'First', 'Fix the login page', 'Newest', 'Third']);
  });

  test('with no room between two ranks, the column is renumbered in exactly one batch_issues call, the moved card first', async () => {
    await open({
      fixtures: {
        issues: [
          { id: 'issue_a', title: 'First', status: 'todo', rank: 5 },
          { id: 'issue_b', title: 'Second', status: 'todo', rank: 5 },
          { id: 'issue_login', title: 'Fix the login page', status: 'doing' },
        ],
      },
    });

    drop('Fix the login page', 'To do', 1);
    await host!.waitFor(() => columnOf('Fix the login page') === 'To do', { what: 'the card in To do' });
    await host!.idle();

    // One call, so one approval card, and all or none of it happens.
    expect(host!.calls.filter(call => call.tool !== 'list_issues').map(call => [call.tool, call.input, call.asked])).toEqual([
      [
        'batch_issues',
        {
          changes: [
            { op: 'update', id: 'issue_login', version: 1, fields: { status: 'todo', rank: 2048 } },
            { op: 'update', id: 'issue_a', version: 1, fields: { rank: 1024 } },
            { op: 'update', id: 'issue_b', version: 1, fields: { rank: 3072 } },
          ],
        },
        'allow',
      ],
    ]);
    expect(host!.store!.records('issues').map(one => [one.id, one.status, one.rank])).toEqual([
      ['issue_a', 'todo', 1024],
      ['issue_b', 'todo', 3072],
      ['issue_login', 'todo', 2048],
    ]);
  });

  test('dropped below a card with no rank, that card is ranked too, and nothing after it', async () => {
    await open();

    drop('Fix the login page', 'Doing', 1);
    await host!.waitFor(() => column('Doing').props.count === 2, { what: 'the move' });
    await host!.idle();

    expect(host!.calls.filter(call => call.tool !== 'list_issues').map(call => [call.tool, call.input])).toEqual([
      [
        'batch_issues',
        {
          changes: [
            { op: 'update', id: 'issue_login', version: 1, fields: { status: 'doing', rank: 2048 } },
            { op: 'update', id: 'issue_export', version: 1, fields: { rank: 1024 } },
          ],
        },
      ],
    ]);
    expect(host!.tree.get(column('Doing').id)!.children.map(id => host!.findAll(node => node.type === 'bry-text' && isInside(node, host!.tree.get(id)!))[0]!.props.text)).toEqual([
      'Export to CSV',
      'Fix the login page',
    ]);
  });

  test('a batch refused because somebody else changed one issue sends the card back, changes nothing, and reads again', async () => {
    await open({
      asks: 'hold',
      fixtures: {
        issues: [
          { id: 'issue_a', title: 'First', status: 'todo', rank: 5 },
          { id: 'issue_b', title: 'Second', status: 'todo', rank: 5 },
          { id: 'issue_login', title: 'Fix the login page', status: 'doing' },
        ],
      },
    });

    // While the person is still looking at the card, somebody else changes one of the issues it would rank.
    const card = drop('Fix the login page', 'To do', 1);

    await host!.waitFor(() => host!.calls.some(call => call.tool === 'batch_issues'), { what: 'the batch to wait on the person' });
    host!.store!.put('issues', { id: 'issue_b', title: 'Second, renamed' });
    await host!.answer('allow');

    const line = await errorLine();

    expect(line.props.text).toStartWith('Couldn’t move “Fix the login page”. Change 3 of 3: This issue changed since you read it.');
    await host!.waitFor(() => boardNode().props.settled === card.id, { what: 'the card to go back' });
    expect(host!.store!.records('issues').map(one => [one.id, one.status, one.rank])).toEqual([
      ['issue_a', 'todo', 5],
      ['issue_b', 'todo', 5],
      ['issue_login', 'doing', undefined],
    ]);
  });

  test('a move within its own column is sent back without a call', async () => {
    await open();

    const card = drop('Export to CSV', 'Doing');

    await host!.waitFor(() => boardNode().props.settled === card.id, { what: 'the card to be sent back' });
    expect(host!.calls.map(call => call.tool)).toEqual(['list_issues', 'list_issues', 'list_issues', 'list_issues']);
  });

  test('a move from an old version is refused as stale, sent back, and the board reads the issues again', async () => {
    await open();

    // Somebody else moves it first, and the card is dropped before the board hears.
    host!.store!.put('issues', { id: 'issue_login', status: 'done' });

    const card = drop('Fix the login page', 'Doing');
    const line = await errorLine();

    expect(line.props.text).toStartWith('Couldn’t move “Fix the login page”. This issue changed since you read it.');
    expect(host!.calls.find(call => call.tool === 'update_issue')).toMatchObject({ input: { id: 'issue_login', version: 1, status: 'doing', rank: 1024 } });
    await host!.waitFor(() => columnOf('Fix the login page') === 'Done', { what: 'the board to catch up' });
    await host!.waitFor(() => boardNode().props.settled === card.id, { what: 'the card to be sent back' });
  });

  test('an issue somebody else makes, moves or deletes shows on the open board without a press', async () => {
    await open();

    const reads = () => host!.calls.filter(call => call.tool === 'list_issues').length;

    host!.store!.put('issues', { title: 'Made in a chat', status: 'todo' });
    await host!.waitFor(() => columnOf('Made in a chat') === 'To do', { what: 'the new issue' });
    expect(column('To do').props.count).toBe(2);

    host!.store!.put('issues', { id: 'issue_export', status: 'done' });
    await host!.waitFor(() => columnOf('Export to CSV') === 'Done', { what: 'the moved issue' });

    host!.store!.remove('issues', 'issue_docs');
    await host!.waitFor(() => !titled('Write the help page'), { what: 'the deleted issue to go' });

    // To do's first page and three columns on open, and again three for each change: a read is one per column.
    expect((reads() - 1) % 3).toBe(0);
    expect(reads()).toBeLessThanOrEqual(13);
    expect(host!.calls.filter(call => call.tool !== 'list_issues')).toEqual([]);
    expect(host!.refusals).toEqual([]);
  });

  test('New issue opens a form for a title, and Add makes it in To do with create_issue', async () => {
    await open();

    host!.press(host!.byText('New issue')!);

    const field = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input')[0], { what: 'the title field' });
    const add = () => host!.findAll(node => node.type === 'bry-button' && node.props.label === 'Add')[0]!;

    expect(field.props).toMatchObject({ label: 'Title', value: '', required: true });
    // Nothing to add until something is typed.
    expect(add().props.disabled).toBe(true);

    host!.event(field.id, 'change', { value: 'Fix the door' });
    await host!.waitFor(() => !add().props.disabled, { what: 'Add to be pressable' });
    host!.press(add());
    await host!.waitFor(() => columnOf('Fix the door') === 'To do', { what: 'the new issue' });

    expect(host!.calls.find(call => call.tool === 'create_issue')).toMatchObject({ input: { title: 'Fix the door', status: 'todo' } });
    // The form closes once the issue is made.
    await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input').length === 0, { what: 'the form to close' });
    expect(host!.refusals).toEqual([]);
  });

  test('in a project, the form shows the project, filled in and not editable, and the issue made there is its (A2-F06-S03)', async () => {
    await open({ directory: { projects: [{ id: 'project_1', name: 'Website' }] } });

    host!.press(host!.byText('New issue')!);

    const project = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input' && node.props.label === 'Project' && node.props.value === 'Website')[0], { what: 'the project field' });

    expect(project.props).toEqual({ label: 'Project', value: 'Website', disabled: true });
    expect(host!.namesAsked).toEqual([{ kind: 'projects', ids: ['project_1'] }]);
    expect(() => host!.raise('bry-input', project, 'change', { value: 'Elsewhere' })).not.toThrow();
    // Nothing the form sends names a project: Brydio links it to the placement's.
    const title = host!.findAll(node => node.type === 'bry-input' && node.props.label === 'Title')[0]!;

    host!.event(title.id, 'change', { value: 'Linked here' });
    await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input' && node.props.label === 'Title')[0]?.props.value === 'Linked here');
    host!.event(title.id, 'submit', { value: 'Linked here' });
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'create_issue'), { what: 'the create' });
    expect(host!.calls.find(call => call.tool === 'create_issue')!.input).not.toHaveProperty('project');
  });

  test('Enter in the title field adds the issue too, and Cancel closes the form without a call', async () => {
    await open();

    host!.press(host!.byText('New issue')!);

    let field = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input')[0], { what: 'the title field' });

    host!.event(field.id, 'change', { value: 'Export to PDF' });
    await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input')[0]?.props.value === 'Export to PDF', { what: 'the typed title' });
    host!.event(field.id, 'submit', { value: 'Export to PDF' });
    await host!.waitFor(() => column('To do').props.count === 2, { what: 'the new issue' });

    host!.press(host!.byText('New issue')!);
    field = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input')[0], { what: 'the title field again' });
    host!.event(field.id, 'change', { value: 'Never mind' });
    host!.press(host!.findAll(node => node.type === 'bry-button' && node.props.label === 'Cancel')[0]!);
    await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input').length === 0, { what: 'the form to close' });

    expect(host!.calls.filter(call => call.tool === 'create_issue')).toHaveLength(1);
  });

  test('a card shows its labels as badges', async () => {
    await open();

    const badge = host!.findAll(node => node.type === 'bry-badge' && node.props.text === 'data')[0]!;

    expect(badge.props.tone).toBe('neutral');
    expect(isInside(badge, cardOf('Export to CSV'))).toBe(true);
  });

  test('a due date picked in the form is sent with create_issue, and a card says when it is due', async () => {
    await open();

    expect(isInside(host!.byText('Due 3 Oct')!, cardOf('Write the help page'))).toBe(true);
    expect(host!.findAll(node => node.type === 'bry-text' && String(node.props.text).startsWith('Due '))).toHaveLength(1);

    host!.press(host!.byText('New issue')!);

    const field = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-input')[0], { what: 'the title field' });
    const date = host!.findAll(node => node.type === 'bry-date')[0]!;

    expect(date.props).toMatchObject({ label: 'Due', placeholder: 'No due date' });
    host!.event(field.id, 'change', { value: 'Ship the release' });
    host!.event(date.id, 'change', { value: '2026-11-20' });
    await host!.waitFor(() => host!.findAll(node => node.type === 'bry-date')[0]?.props.value === '2026-11-20', { what: 'the picked date' });
    host!.event(field.id, 'submit', { value: 'Ship the release' });
    await host!.waitFor(() => host!.byText('Due 20 Nov'), { what: 'the new card’s due date' });

    expect(host!.calls.find(call => call.tool === 'create_issue')).toMatchObject({
      input: { title: 'Ship the release', status: 'todo', due: '2026-11-20' },
    });
  });

  test('a card’s actions button is named for the issue, and its menu deletes it with delete_issue', async () => {
    await open();

    const menu = host!.findAll(node => node.type === 'bry-menu' && isInside(node, cardOf('Export to CSV')))[0]!;
    const button = host!.tree.get(menu.children[0]!)!;

    expect(button.props).toMatchObject({ label: 'Actions for Export to CSV', icon: 'more', hideLabel: true, variant: 'ghost' });
    expect(menu.props.items).toEqual([{ id: 'delete', label: 'Delete', icon: 'trash', tone: 'danger' }]);
    host!.event(menu.id, 'select', { id: 'delete' });
    await host!.waitFor(() => !titled('Export to CSV'), { what: 'the card to go' });

    expect(host!.calls.find(call => call.tool === 'delete_issue')).toMatchObject({ input: { id: 'issue_export' }, asked: 'allow' });
    expect(column('Doing').props.count).toBe(0);
    expect(host!.refusals).toEqual([]);
  });

  test('placed for the whole workspace, each card names its project, and a filter narrows the board by hand (S05)', async () => {
    host = FakeHost.start({
      entry: board,
      manifest,
      context: { placement: { id: 'placement_ws', kind: 'workspace-sidebar' } },
      directory: { projects: [{ id: 'project_web', name: 'Website' }, { id: 'project_app', name: 'Mobile app' }] },
      fixtures: {
        issues: [
          { id: 'issue_login', title: 'Fix the login page', status: 'todo', project: 'project_web' },
          { id: 'issue_export', title: 'Export to CSV', status: 'doing', project: 'project_app' },
          { id: 'issue_docs', title: 'Write the help page', status: 'done' },
        ],
      },
    });
    await host.mounted();
    await host.waitFor(() => host!.findAll(node => node.type === 'bry-badge').length === 2, { what: 'the project names' });

    const badgeIn = (title: string) => host!.findAll(node => node.type === 'bry-badge' && isInside(node, cardOf(title)))[0]?.props.text;
    const filter = () => host!.findAll(node => node.type === 'bry-select' && node.props.label === 'Project')[0]!;

    expect([badgeIn('Fix the login page'), badgeIn('Export to CSV'), badgeIn('Write the help page')]).toEqual(['Website', 'Mobile app', undefined]);
    expect(filter().props.options).toEqual([
      { value: 'all', label: 'All projects' },
      { value: 'project_app', label: 'Mobile app' },
      { value: 'project_web', label: 'Website' },
      { value: 'none', label: 'No project' },
    ]);

    host.raise('bry-select', filter(), 'change', { value: 'project_web' });
    await host.waitFor(() => !titled('Export to CSV'), { what: 'the other projects to go' });
    expect([titled('Fix the login page'), titled('Write the help page')].map(Boolean)).toEqual([true, false]);

    host.raise('bry-select', filter(), 'change', { value: 'none' });
    await host.waitFor(() => titled('Write the help page') && !titled('Fix the login page'), { what: 'issues in no project' });

    host.raise('bry-select', filter(), 'change', { value: 'all' });
    await host.waitFor(() => titled('Export to CSV') && titled('Fix the login page'), { what: 'every issue again' });
  });

  test('placed in a project, it shows no project filter and asks only for its own project’s name', async () => {
    await open();

    expect(host!.findAll(node => node.type === 'bry-select' && node.props.label === 'Project')).toEqual([]);
    expect(host!.namesAsked.filter(one => one.kind === 'projects')).toEqual([{ kind: 'projects', ids: ['project_1'] }]);
  });

  test('a list that cannot be read says so', async () => {
    host = FakeHost.start({
      entry: board,
      manifest,
      tools: { list_issues: () => ({ isError: true, content: [{ type: 'text', text: 'You can’t see this board.' }], structuredContent: { error: 'refused' } }) },
    });
    await host.mounted();

    const line = await host.waitFor(() => host!.findAll(node => node.props.tone === 'danger')[0], { what: 'the error line' });

    expect(line.props.text).toBe('Couldn’t load the issues. You can’t see this board.');
  });
});
