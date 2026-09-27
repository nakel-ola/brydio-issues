import { validateManifest } from '@brydio/manifest';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));

test('the rebuilt Plan manifest replaces the standalone board with keyed project surfaces', () => {
  expect(validateManifest(manifest)).toMatchObject({ ok: true, problems: [] });
  expect(manifest.version).toBe('1.0.1');
  expect(manifest.screens.board).toBeUndefined();
  expect(manifest.placements.map((placement: { key: string; kind: string }) => [placement.key, placement.kind])).toEqual([
    ['list', 'project-sidebar'],
    ['sprint', 'project-sidebar'],
    ['sprint-folder', 'project-sidebar'],
    ['plan-home', 'workspace-sidebar'],
  ]);
});
