import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../build.ts";

// A tiny project: platform/main.ts plus plugins a (layer 1) and b (layer 2), with overrides.
const dirs: string[] = [];
async function project(files: Record<string, string>, app = [{ name: "a", on: true }, { name: "b", on: true }]) {
  const dir = mkdtempSync(join(tmpdir(), "nws-build-"));
  dirs.push(dir);
  const base: Record<string, string> = {
    "platform/main.ts": 'import plugins from "app:plugins"; console.log(plugins.length);',
    "platform/ui/part.ts": "export const part = 1;",
    "plugins/a/plugin.json": JSON.stringify({ name: "a", layer: 1, uses: [] }),
    "plugins/a/index.ts": "export default () => {};",
    "plugins/a/off.ts": "export default () => {};",
    "plugins/b/plugin.json": JSON.stringify({ name: "b", layer: 2, uses: ["a"] }),
    "plugins/b/index.ts": 'import { part } from "../../platform/ui/part.ts"; export default () => part;',
    "plugins/b/off.ts": "export default () => {};",
    "app.json": JSON.stringify({ plugins: app }),
  };
  for (const [path, text] of Object.entries({ ...base, ...files })) await Bun.write(join(dir, path), text);
  return dir;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("build", () => {
  test("the site and its light version build", async () => {
    for (const app of ["app.json", "app.light.json"]) {
      const b = await build(app);
      expect(b.js.length).toBeGreaterThan(1000);
      expect(b.hash).toMatch(/^[0-9a-f]{10}$/);
    }
  });

  test("a disabled plugin ships its off.ts", async () => {
    const dir = await project({ "plugins/b/off.ts": 'export default () => "B-IS-OFF";' }, [{ name: "a", on: true }, { name: "b", on: false }]);
    expect((await build("app.json", dir)).js).toContain("B-IS-OFF");
  });

  test("a plugin importing another plugin fails the build", async () => {
    const dir = await project({ "plugins/b/index.ts": 'import x from "../a/index.ts"; export default x;' });
    await expect(build("app.json", dir)).rejects.toThrow("reaches other plugins only through the host");
  });

  test("a ui part importing a plugin fails the build", async () => {
    const dir = await project({ "platform/ui/part.ts": 'import a from "../../plugins/a/index.ts"; export const part = a;' });
    await expect(build("app.json", dir)).rejects.toThrow("ui parts never import a plugin");
  });

  test("uses that go up a layer or round in a circle fail the build", async () => {
    const up = await project({ "plugins/a/plugin.json": JSON.stringify({ name: "a", layer: 1, uses: ["b"] }) });
    await expect(build("app.json", up)).rejects.toThrow("calls never go up a layer");
    const circle = await project({
      "plugins/a/plugin.json": JSON.stringify({ name: "a", layer: 2, uses: ["b"] }),
      "plugins/b/plugin.json": JSON.stringify({ name: "b", layer: 2, uses: ["a"] }),
    });
    await expect(build("app.json", circle)).rejects.toThrow("round in a circle");
  });

  test("a missing off.ts or an unlisted used plugin fails the build", async () => {
    const noOff = await project({ "plugins/b/off.ts": "" }, [{ name: "a", on: true }, { name: "b", on: false }]);
    rmSync(join(noOff, "plugins/b/off.ts"));
    await expect(build("app.json", noOff)).rejects.toThrow("plugins/b/off.ts is missing");
    const unlisted = await project({}, [{ name: "b", on: true }]);
    await expect(build("app.json", unlisted)).rejects.toThrow("b uses a, which app.json does not list");
  });
});
