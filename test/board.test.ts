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
    { id: 'issue_docs', title: 'Write the help page', status: 'done' },
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

/** The column a card sits in, by the heading at the top of its stack: "Doing (1)" → "Doing". */
function columnOf(title: string): string | undefined {
  let node: TreeNode | undefined = titled(title);

  while (node) {
    const heading = node.children.map(id => host!.tree.get(id)).find(child => child?.type === 'bry-heading');

    if (heading && heading.props.level === 2) return String(heading.props.text).replace(/ \(\d+\)$/, '');

    node = host!.parentOf(node);
  }

  return undefined;
}

/** The card holding this title, and its ← and → buttons. */
function cardOf(title: string) {
  let card = titled(title);

  while (card && card.type !== 'bry-card') card = host!.parentOf(card);

  const buttons = host!.findAll(node => node.type === 'bry-button' && isInside(node, card!));

  return { card: card!, left: buttons.find(one => one.props.label === '←'), right: buttons.find(one => one.props.label === '→') };
}

function isInside(node: TreeNode, ancestor: TreeNode): boolean {
  for (let at = host!.parentOf(node); at; at = host!.parentOf(at)) if (at.id === ancestor.id) return true;

  return false;
}

async function open(options: Partial<Parameters<typeof FakeHost.start>[0]> = {}) {
  host = FakeHost.start({ entry: board, manifest, fixtures: FIXTURES, ...options });
  await host.mounted();
  await host.waitFor(() => host!.byText('Fix the login page'), { what: 'the issues to load' });

  return host;
}

test('the manifest is one Brydio’s server accepts', () => {
  expect(validateManifest(manifest)).toMatchObject({ ok: true, problems: [] });
});

describe('the board', () => {
  test('draws the three columns from the issues, each card in its status’s column', async () => {
    await open();

    expect(host!.findAll(node => node.type === 'bry-heading').map(node => node.props.text)).toEqual([
      'Issues',
      'To do (1)',
      'Doing (1)',
      'Done (1)',
    ]);
    expect(columnOf('Fix the login page')).toBe('To do');
    expect(columnOf('Export to CSV')).toBe('Doing');
    expect(columnOf('Write the help page')).toBe('Done');
    expect(host!.calls[0]).toMatchObject({ tool: 'list_issues', input: { limit: 200 } });

    // A card can only move towards a column that exists.
    expect(cardOf('Fix the login page')).toMatchObject({ left: undefined, right: { type: 'bry-button' } });
    expect(cardOf('Write the help page').right).toBeUndefined();
    expect(host!.refusals).toEqual([]);
  });

  test('→ moves a card with update_issue { id, version, status }, then draws it in the next column', async () => {
    await open();

    host!.press(cardOf('Fix the login page').right!);
    await host!.waitFor(() => columnOf('Fix the login page') === 'Doing', { what: 'the card to move' });

    expect(host!.calls.map(call => call.tool)).toEqual(['list_issues', 'update_issue', 'list_issues']);
    expect(host!.calls[1]).toMatchObject({ input: { id: 'issue_login', version: 1, status: 'doing' }, asked: 'allow' });
    expect(host!.byText('Doing (2)')).toBeDefined();
    expect(host!.store!.records('issues').find(issue => issue.id === 'issue_login')).toMatchObject({ status: 'doing', version: 2 });

    // And back again, from the version it is at now.
    host!.press(cardOf('Fix the login page').left!);
    await host!.waitFor(() => columnOf('Fix the login page') === 'To do', { what: 'the card to move back' });

    expect(host!.calls[3]).toMatchObject({ tool: 'update_issue', input: { id: 'issue_login', version: 2, status: 'todo' } });
    expect(host!.refusals).toEqual([]);
  });

  test('New issue adds one to To do with create_issue', async () => {
    await open();

    host!.press(host!.byText('New issue')!);
    await host!.waitFor(() => host!.byText('To do (2)'), { what: 'the new issue' });

    expect(host!.calls[1]).toMatchObject({ tool: 'create_issue', input: { title: 'New issue', status: 'todo' } });
    expect(columnOf('New issue')).toBe('To do');
  });

  test('a write that fails leaves the board as it was and says why on an error line', async () => {
    await open({ asks: 'deny' });

    host!.press(cardOf('Export to CSV').right!);

    const line = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-text' && node.props.tone === 'danger')[0], { what: 'the error line' });

    expect(line.props.text).toBe('Couldn’t move “Export to CSV”. The person didn’t allow it.');
    expect(columnOf('Export to CSV')).toBe('Doing');
  });

  test('a move from an old version is refused as stale, and the board reads the issues again', async () => {
    await open();

    // Somebody else moves it first.
    host!.store!.tools().update_issue!({ id: 'issue_login', version: 1, status: 'done' });
    host!.press(cardOf('Fix the login page').right!);

    const line = await host!.waitFor(() => host!.findAll(node => node.type === 'bry-text' && node.props.tone === 'danger')[0], { what: 'the error line' });

    expect(line.props.text).toStartWith('Couldn’t move “Fix the login page”. This issue changed since you read it.');
    await host!.waitFor(() => columnOf('Fix the login page') === 'Done', { what: 'the board to catch up' });
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
