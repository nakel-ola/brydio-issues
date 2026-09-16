import { build } from '@brydio/cli';
import { FakeHost, type TreeNode } from '@brydio/fake-host';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
const board = join(root, 'dist/screens/board.js');
const PAUSE = 600;

const FIXTURES = {
  issues: [
    { id: 'issue_login', title: 'Fix the login page', status: 'todo', labels: ['bug'], rank: 1024 },
    { id: 'issue_export', title: 'Export to CSV', status: 'doing', rank: 1024, body: 'Every **column**, in order.' },
  ],
  labels: [
    { id: 'label_bug', name: 'bug', colour: 'danger' },
    { id: 'label_data', name: 'data', colour: 'brand' },
  ],
};

let host: FakeHost | null = null;

beforeAll(async () => {
  expect((await build(root)).problems.filter(problem => problem.severity === 'error')).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

const of = (type: string, words?: string) =>
  host!.findAll(node => node.type === type && (words === undefined || node.props.label === words || node.props.text === words || node.props.title === words))[0];
const cardTitled = (title: string) => {
  let at: TreeNode | undefined = host!.findAll(node => node.type === 'bry-text' && node.props.text === title)[0];

  while (at && at.type !== 'bry-card') at = host!.parentOf(at);

  return at!;
};
function isInside(node: TreeNode, ancestor: TreeNode): boolean {
  for (let at = host!.parentOf(node); at; at = host!.parentOf(at)) if (at.id === ancestor.id) return true;

  return false;
}

const saves = () => host!.calls.filter(call => call.tool === 'update_issue').map(call => call.input);

async function openIssue(title: string, options: Partial<Parameters<typeof FakeHost.start>[0]> = {}) {
  host = FakeHost.start({ entry: board, manifest, fixtures: FIXTURES, ...options });
  await host.mounted();
  await host.waitFor(() => host!.byText(title), { what: 'the board' });
  host.press(cardTitled(title));
  await host.waitFor(() => of('bry-input', 'Title')?.props.value === title, { what: 'the issue to open' });
}

describe('the issue screen (A8-F01-S03)', () => {
  test('a card opens its issue in the same tab through ui/navigate, as the selection, and Back returns to the board', async () => {
    await openIssue('Fix the login page');

    expect(host!.navigations).toEqual([{ kind: 'item', id: 'issue_login', opened: true }]);
    expect(host!.findAll(node => node.type === 'bry-board')).toEqual([]);
    expect(of('bry-select', 'Status')!.props).toMatchObject({ value: 'todo', options: [{ value: 'todo', label: 'To do' }, { value: 'doing', label: 'Doing' }, { value: 'done', label: 'Done' }] });

    host!.press(of('bry-button', 'Back to the board')!);
    await host!.waitFor(() => of('bry-board'), { what: 'the board again' });
    // Back closes the item with Brydio, which takes it out of the address.
    await host!.waitFor(() => host!.received.some(message => message.method === 'ui/navigate' && JSON.stringify(message.params) === '{"to":{"kind":"item","id":null}}'), { what: 'the item to be closed' });
    expect(saves()).toEqual([]);
  });

  test('an item the host selects, as a shared link would, opens straight to that issue', async () => {
    host = FakeHost.start({ entry: board, manifest, fixtures: FIXTURES, context: { selection: { kind: 'item', id: 'issue_export' } } });
    await host.mounted();
    await host.waitFor(() => of('bry-input', 'Title')?.props.value === 'Export to CSV', { what: 'the issue' });

    expect(of('bry-markdown')!.props.text).toBe('Every **column**, in order.');

    // And one the host selects while the board is open, as the address changing would.
    host.press(of('bry-button', 'Back to the board')!);
    await host.waitFor(() => of('bry-board'), { what: 'the board' });
    host.setContext({ selection: { kind: 'item', id: 'issue_login' } });
    await host.waitFor(() => of('bry-input', 'Title')?.props.value === 'Fix the login page', { what: 'the selected issue' });
  });

  test('each field saves on its own, with no Save button, from the version the last save returned', async () => {
    await openIssue('Fix the login page');

    host!.raise('bry-select', of('bry-select', 'Status')!, 'change', { value: 'doing' });
    await host!.waitFor(() => saves().length === 1);
    host!.raise('bry-date', of('bry-date', 'Due')!, 'change', { value: '2026-10-03' });
    await host!.waitFor(() => host!.byText('Due 3 Oct'), { what: 'the due date' });

    // Typing saves once, when it pauses.
    const title = of('bry-input', 'Title')!;

    for (const value of ['Fix the', 'Fix the sign-in', 'Fix the sign-in page']) host!.raise('bry-input', title, 'change', { value });
    await Bun.sleep(PAUSE / 2);
    expect(saves()).toHaveLength(2);
    await host!.waitFor(() => saves().length === 3, { timeout: 3_000 });

    host!.press(of('bry-button', 'Edit description')!);

    const area = await host!.waitFor(() => of('bry-textarea'), { what: 'the description field' });

    host!.raise('bry-textarea', area, 'change', { value: 'People with passkeys **can’t** sign in.' });
    host!.press(of('bry-button', 'Done')!);
    await host!.waitFor(() => of('bry-markdown')?.props.text === 'People with passkeys **can’t** sign in.', { what: 'the description, read as markdown' });
    await host!.idle();

    expect(saves()).toEqual([
      { id: 'issue_login', version: 1, status: 'doing' },
      { id: 'issue_login', version: 2, due: '2026-10-03' },
      { id: 'issue_login', version: 3, title: 'Fix the sign-in page' },
      { id: 'issue_login', version: 4, body: 'People with passkeys **can’t** sign in.' },
    ]);
    expect(host!.findAll(node => node.type === 'bry-button' && /^Save/.test(String(node.props.label)))).toEqual([]);
    expect(host!.store!.records('issues').find(issue => issue.id === 'issue_login')).toMatchObject({ status: 'doing', title: 'Fix the sign-in page', version: 5 });
  });

  test('a card shows its assignee’s avatar and name, and the assignee picker saves who, or nobody', async () => {
    // Cy is assigned nothing: the picker lists everyone Brydio lets this Issues name, not only who is assigned.
    const directory = { members: [{ id: 'user_ada', name: 'Ada Lovelace' }, { id: 'user_bo', name: 'Bo Diddley' }, { id: 'user_cy', name: 'Cy Twombly' }] };
    const fixtures = {
      ...FIXTURES,
      issues: [
        { ...FIXTURES.issues[0], assignee: 'user_ada' },
        { ...FIXTURES.issues[1], assignee: 'user_bo' },
      ],
    };

    host = FakeHost.start({ entry: board, manifest, fixtures, directory });
    await host.mounted();
    await host.waitFor(() => host!.findAll(node => node.type === 'bry-avatar').length === 2, { what: 'the avatars' });

    const avatarIn = (title: string) => host!.findAll(node => node.type === 'bry-avatar' && isInside(node, cardTitled(title)))[0]!;

    expect(avatarIn('Fix the login page').props).toEqual({ name: 'Ada Lovelace', size: 'sm' });
    expect(avatarIn('Export to CSV').props.name).toBe('Bo Diddley');
    // Asked once, for both people, not once per card.
    expect(host.namesAsked.filter(one => one.kind === 'members')).toEqual([{ kind: 'members', ids: ['user_ada', 'user_bo'] }]);

    host.press(cardTitled('Fix the login page'));
    await host.waitFor(() => of('bry-select', 'Assignee')?.props.options, { what: 'the assignee picker' });

    expect(of('bry-select', 'Assignee')!.props).toMatchObject({
      value: 'user_ada',
      options: [
        { value: 'unassigned', label: 'Unassigned' },
        { value: 'user_ada', label: 'Ada Lovelace' },
        { value: 'user_bo', label: 'Bo Diddley' },
        { value: 'user_cy', label: 'Cy Twombly' },
      ],
    });

    host.raise('bry-select', of('bry-select', 'Assignee')!, 'change', { value: 'user_bo' });
    await host.waitFor(() => saves().length === 1);
    host.raise('bry-select', of('bry-select', 'Assignee')!, 'change', { value: 'unassigned' });
    await host.waitFor(() => saves().length === 2);

    expect(saves()).toEqual([
      { id: 'issue_login', version: 1, assignee: 'user_bo' },
      { id: 'issue_login', version: 2, assignee: null },
    ]);
  });

  test('Ask about this issue drafts a chat about it, for the person to send, and sends nothing', async () => {
    await openIssue('Fix the login page');

    host!.press(of('bry-button', 'Ask about this issue')!);
    await host!.waitFor(() => host!.asks.length === 1, { what: 'the draft' });

    expect(host!.asks).toEqual([
      { text: 'What should happen next on “Fix the login page”?', target: { collection: 'issues', id: 'issue_login', title: 'Fix the login page' } },
    ]);
    expect(host!.calls.filter(call => call.tool !== 'list_issues' && call.tool !== 'get_issue' && call.tool !== 'list_labels')).toEqual([]);
  });

  test('an issue opened on a project it doesn’t belong to still opens, and says which project it does', async () => {
    host = FakeHost.start({
      entry: board,
      manifest,
      fixtures: { ...FIXTURES, issues: [{ ...FIXTURES.issues[0], project: 'project_web' }] },
      directory: { projects: [{ id: 'project_web', name: 'Website refresh' }] },
      context: { selection: { kind: 'item', id: 'issue_login' } },
    });
    await host.mounted();
    await host.waitFor(() => host!.byText('This issue belongs to Website refresh.'), { what: 'where it belongs' });

    expect(of('bry-input', 'Title')!.props.value).toBe('Fix the login page');
    host.stop();

    // One that belongs here says nothing of the sort.
    host = FakeHost.start({
      entry: board,
      manifest,
      fixtures: { ...FIXTURES, issues: [{ ...FIXTURES.issues[0], project: 'project_1' }] },
      context: { selection: { kind: 'item', id: 'issue_login' } },
    });
    await host.mounted();
    await host.waitFor(() => of('bry-input', 'Title')?.props.value === 'Fix the login page', { what: 'the issue' });
    expect(host.findAll(node => String(node.props.text ?? '').startsWith('This issue belongs'))).toEqual([]);
  });

  test('the labels picker lists this instance’s labels, ticks save, and New label makes one and adds it', async () => {
    await openIssue('Fix the login page');

    const boxes = () => host!.findAll(node => node.type === 'bry-checkbox').map(node => [node.props.label, node.props.checked === true]);

    await host!.waitFor(() => boxes().length === 2, { what: 'the labels' });
    expect(boxes()).toEqual([
      ['bug', true],
      ['data', false],
    ]);

    host!.raise('bry-checkbox', of('bry-checkbox', 'data')!, 'change', { checked: true });
    await host!.waitFor(() => saves().length === 1);
    expect(saves()[0]).toEqual({ id: 'issue_login', version: 1, labels: ['bug', 'data'] });

    host!.raise('bry-input', of('bry-input', 'New label')!, 'change', { value: 'design' });
    await host!.waitFor(() => of('bry-button', 'Add label')?.props.disabled !== true, { what: 'Add label' });
    host!.press(of('bry-button', 'Add label')!);
    await host!.waitFor(() => boxes().some(([name, checked]) => name === 'design' && checked), { what: 'the new label, ticked' });

    expect(host!.calls.find(call => call.tool === 'create_label')!.input).toEqual({ name: 'design', colour: 'neutral' });
    expect(host!.store!.records('issues').find(issue => issue.id === 'issue_login')!.labels).toEqual(['bug', 'data', 'design']);
  });

  test('a save after somebody else’s change is refused with “Someone else changed this; reload to see”, and Reload shows theirs', async () => {
    await openIssue('Fix the login page');

    host!.store!.put('issues', { id: 'issue_login', title: 'Fixed by somebody else' });
    host!.raise('bry-select', of('bry-select', 'Status')!, 'change', { value: 'done' });
    await host!.waitFor(() => host!.byText('Someone else changed this; reload to see.'), { what: 'the stale sentence' });

    expect(host!.store!.records('issues').find(issue => issue.id === 'issue_login')).toMatchObject({ title: 'Fixed by somebody else', status: 'todo', version: 2 });
    expect(of('bry-select', 'Status')!.props.disabled).toBe(true);

    host!.press(of('bry-button', 'Reload')!);
    await host!.waitFor(() => of('bry-input', 'Title')?.props.value === 'Fixed by somebody else', { what: 'their change' });
    expect(host!.byText('Someone else changed this; reload to see.')).toBeUndefined();

    host!.raise('bry-select', of('bry-select', 'Status')!, 'change', { value: 'done' });
    await host!.waitFor(() => host!.store!.records('issues').find(issue => issue.id === 'issue_login')!.status === 'done', { what: 'the save after reloading' });
  });
});
