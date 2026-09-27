import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function snapshot(folder: 'bundle' | 'dist'): Map<string, string> {
  const files = new Map<string, string>();

  for (const file of new Bun.Glob('**/*').scanSync({ cwd: resolve(root, folder), onlyFiles: true, dot: true })) {
    const name = folder === 'bundle' && file === '.brydio/app.json' ? 'app.json' : file;

    files.set(name, Bun.hash(readFileSync(resolve(root, folder, file))).toString(16));
  }

  return new Map([...files].sort(([left], [right]) => left.localeCompare(right)));
}

test('the committed repository bundle equals a fresh immutable Plan build', async () => {
  const committed = snapshot('bundle');
  const build = Bun.spawn(['bun', 'run', 'build'], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await build.exited;

  expect(exitCode, `${await new Response(build.stdout).text()}${await new Response(build.stderr).text()}`).toBe(0);

  const published = await Bun.file(resolve(root, 'dist/app.json')).json();
  const repository = await Bun.file(resolve(root, 'bundle/.brydio/app.json')).json();

  expect(repository).toEqual(published);
  expect(repository.version).toBe('1.0.0');
  expect(repository.displayName).toBe('Plan');
  expect(Object.keys(repository.screens).sort()).toEqual(['issue', 'plan', 'sprint']);
  expect(snapshot('bundle')).toEqual(snapshot('dist'));
  expect(committed).toEqual(snapshot('bundle'));
  expect([...committed.keys()]).not.toContain('screens/board.js');
});
