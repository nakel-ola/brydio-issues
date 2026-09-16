import { build } from '@brydio/cli';
import { FakeHost, FixtureStore } from '@brydio/fake-host';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
const board = join(root, 'dist/screens/board.js');
const STATUSES = ['todo', 'doing', 'done'] as const;

/** 500 issues: 350 to do, 100 doing, 50 done, each ranked in order. */
const MANY = Array.from({ length: 500 }, (_, at) => ({
  id: `issue_${String(at).padStart(3, '0')}`,
  title: `Issue ${at}`,
  status: at < 350 ? 'todo' : at < 450 ? 'doing' : 'done',
  rank: (at + 1) * 1024,
}));

let host: FakeHost | null = null;

beforeAll(async () => {
  expect((await build(root)).problems.filter(problem => problem.severity === 'error')).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

const column = (title: string) => host!.findAll(node => node.type === 'bry-board-column' && node.props.title === title)[0]!;
/** The first words drawn inside a node: a card's title. */
function firstText(id: string): unknown {
  const node = host!.tree.get(id)!;

  if (node.type === 'bry-text') return node.props.text;

  for (const child of node.children) {
    const found = firstText(child);

    if (found !== undefined) return found;
  }

  return undefined;
}

const titlesIn = (title: string) => host!.tree.get(column(title).id)!.children.map(firstText);

describe('a board of 500 issues (A8-F01-S02)', () => {
  test('reads every page, and each column holds its count but draws only a window of cards', async () => {
    const started = Date.now();

    host = FakeHost.start({ entry: board, manifest, fixtures: { issues: MANY } });
    await host.mounted();
    await host.waitFor(() => column('To do')?.props.count === 350, { what: 'all 500', timeout: 5_000 });

    const took = Date.now() - started;

    expect(STATUSES.map(status => host!.findAll(node => node.type === 'bry-board-column')[STATUSES.indexOf(status)]!.props.count)).toEqual([350, 100, 50]);
    // Each column's first 12 at once, then the rest of each column: To do's 338 in two pages, Doing's 88 in one, Done's 38 in one.
    const reads = host.calls.filter(call => call.tool === 'list_issues').map(call => call.input as { filter: { status: string }; sort: unknown; limit: number; cursor?: string });

    expect(reads.slice(0, 3)).toEqual([
      { filter: { status: 'todo' }, sort: { field: 'rank', dir: 'asc' }, limit: 12 },
      { filter: { status: 'doing' }, sort: { field: 'rank', dir: 'asc' }, limit: 12 },
      { filter: { status: 'done' }, sort: { field: 'rank', dir: 'asc' }, limit: 12 },
    ]);
    expect(reads.slice(3).every(read => read.limit === 200 && read.cursor && JSON.stringify(read.sort) === '{"field":"rank","dir":"asc"}')).toBe(true);
    expect(reads.slice(3).map(read => read.filter.status).sort()).toEqual(['doing', 'done', 'todo', 'todo']);
    expect(host.findAll(node => node.type === 'bry-card')).toHaveLength(40 + 40 + 40);
    expect(host.tree.size).toBeLessThan(1_500);
    expect(titlesIn('To do').slice(0, 2)).toEqual(['Issue 0', 'Issue 1']);
    // The fake host is not the browser; this only keeps a regression from hiding here.
    expect(took).toBeLessThan(3_000);
  });

  test('opens with To do’s first cards, before the other columns or any later page are read, and carries only titles at first', async () => {
    const pages = new FixtureStore(manifest, { issues: MANY }).tools().list_issues!;
    let release: () => void = () => {};
    const held = new Promise<void>(resolve => (release = resolve));

    host = FakeHost.start({
      entry: board,
      manifest,
      fixtures: { issues: MANY },
      // To do's first page answers at once; Doing's, Done's and every later page wait for the test.
      tools: {
        list_issues: async input => {
          const read = input as { filter: { status: string }; cursor?: string };

          if (read.cursor || read.filter.status !== 'todo') await held;

          return pages(input);
        },
      },
    });
    await host.mounted();

    // To do's first 12, drawn alone: the first cards on the screen don't wait for the other columns.
    await host.waitFor(() => column('To do')?.props.count === 12, { what: 'To do’s first page, drawn', timeout: 5_000 });

    expect(column('Doing').props.count).toBe(0);
    expect(host.findAll(node => node.type === 'bry-board')[0]!.props.loading).toBeUndefined();

    // The first tree with cards in it has their titles, and no menus, avatars or badges yet.
    const first = JSON.stringify(host.received.find(message => JSON.stringify(message).includes('"bry-card"')));

    console.log('FIRST', first.slice(0, 1500));
    expect(first).toContain('Issue 0');
    expect(first).not.toContain('bry-menu');
    expect(first).not.toContain('bry-badge');
    expect(first).not.toContain('bry-avatar');
    // They join on the next update.
    await host.waitFor(() => host!.findAll(node => node.type === 'bry-menu').length === 12, { what: 'the cards’ menus', timeout: 5_000 });

    release();
    await host.waitFor(() => column('To do')?.props.count === 350, { what: 'all 500', timeout: 5_000 });
    expect(column('Done').props.count).toBe(50);
  });

  test('a column’s range draws the cards it asks for, from start, and a move there still writes one rank', async () => {
    host = FakeHost.start({ entry: board, manifest, fixtures: { issues: MANY } });
    await host.mounted();
    await host.waitFor(() => column('To do')?.props.count === 350, { what: 'all 500', timeout: 5_000 });

    host.raise('bry-board-column', column('To do'), 'range', { start: 200, end: 230 });
    await host.waitFor(() => column('To do').props.start === 190, { what: 'the window to move' });

    expect(titlesIn('To do')[0]).toBe('Issue 190');
    expect(titlesIn('To do')).toHaveLength(50);
    expect(titlesIn('To do').at(-1)).toBe('Issue 239');

    const card = host.findAll(node => node.type === 'bry-text' && node.props.text === 'Issue 210')[0]!;
    let holder = host.parentOf(card)!;

    while (holder.type !== 'bry-card') holder = host.parentOf(holder)!;

    host.raise('bry-board', host.findAll(node => node.type === 'bry-board')[0]!, 'move', { card: holder.id, from: column('To do').id, to: column('Doing').id, position: 1 });
    await host.waitFor(() => column('Doing').props.count === 101, { what: 'the move', timeout: 5_000 });

    expect(host.calls.filter(call => call.tool === 'update_issue').map(call => call.input)).toEqual([
      { id: 'issue_210', version: 1, status: 'doing', rank: (351 * 1024 + 352 * 1024) / 2 },
    ]);
    expect(titlesIn('Doing').slice(0, 3)).toEqual(['Issue 350', 'Issue 210', 'Issue 351']);
  });
});
