import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));

test('Plan keeps one shared issue detail entry for selected and direct issue opens', () => {
  expect(manifest.screens.issue).toEqual({ entry: 'screens/issue.js' });
  expect(existsSync(join(root, 'dist/screens/issue.js'))).toBe(true);
});
