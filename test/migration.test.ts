import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readAll } from '../src/data/pages.ts';
import { RefreshQueue, scopeProjectRecords } from '../src/data/project-data.ts';

describe('the clean Plan data layer', () => {
  test('reads every page with the store maximum and carries the caller query', async () => {
    const calls: unknown[] = [];
    const pages = [
      { items: [{ id: 'a' }], nextCursor: 'next' },
      { items: [{ id: 'b' }], nextCursor: null },
    ];
    const list = async (_collection: string, query: unknown) => {
      calls.push(query);
      return pages.shift()!;
    };

    expect(await readAll(list, 'issues', { filter: { project: 'p1' } })).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(calls).toEqual([
      { filter: { project: 'p1' }, limit: 200 },
      { filter: { project: 'p1' }, limit: 200, cursor: 'next' },
    ]);
  });

  test('scopes every project-owned record before a feature receives it', () => {
    expect(scopeProjectRecords('p1', [{ id: 'a', project: 'p1' }, { id: 'b', project: 'p2' }, { id: 'c' }])).toEqual([
      { id: 'a', project: 'p1' },
    ]);
  });

  test('coalesces a burst into the running refresh and one trailing refresh', async () => {
    const releases: Array<() => void> = [];
    let runs = 0;
    const queue = new RefreshQueue(async () => {
      runs += 1;
      await new Promise<void>(resolve => releases.push(resolve));
    });

    const first = queue.request();
    const second = queue.request();
    const third = queue.request();
    releases.shift()!();
    while (releases.length === 0) await Bun.sleep(0);
    releases.shift()!();
    await Promise.all([first, second, third]);

    expect(runs).toBe(2);
  });

  test('declares the clean Plan identity and keyed placements', () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, '..', '.brydio', 'app.json'), 'utf8'));

    expect(manifest).toMatchObject({ name: 'issues', displayName: 'Plan', version: '1.0.3' });
    expect(manifest.placements.map((one: { key: string }) => one.key)).toEqual([
      'list', 'sprint', 'sprint-folder', 'plan-home',
    ]);
  });

  test('upgrades the published Issues schema without dropping its records', () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, '..', '.brydio', 'app.json'), 'utf8'));

    expect(manifest.data.issues.schema).toMatchObject({
      status: { type: ['todo', 'doing', 'done'], optional: true },
      assignee: 'member?',
      body: 'text?',
      project: 'project?',
      due: 'date?',
    });
    expect(manifest.data.labels.schema.project).toBe('project?');
    expect(manifest.migrations).toContainEqual({
      version: '1.0.0',
      steps: expect.arrayContaining([
        { op: 'add', collection: 'issues', field: 'archived' },
        { op: 'add', collection: 'labels', field: 'project' },
      ]),
    });
  });
});
