import { expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the build leaves a repository manifest beside its screens", async () => {
  const build = Bun.spawn(["bun", "run", "build"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await build.exited;
  expect(exitCode).toBe(0);

  const published = await Bun.file(resolve(root, "dist/app.json")).json();
  const repository = await Bun.file(
    resolve(root, "bundle/.brydio/app.json"),
  ).json();

  expect(repository).toEqual(published);
  expect(await Bun.file(resolve(root, "bundle/screens/board.js")).text()).toBe(
    await Bun.file(resolve(root, "dist/screens/board.js")).text(),
  );
  expect(await Bun.file(resolve(root, "bundle/screens/issue.js")).text()).toBe(
    await Bun.file(resolve(root, "dist/screens/issue.js")).text(),
  );
});
