import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Each plugin.json must match its code: the events it emits and hears, the APIs it provides.
const root = join(import.meta.dir, "..", "plugins");

interface Manifest {
  name: string;
  provides: string[];
  events: { emits: string[]; listens: string[] };
}

// Names found in the code of one plugin (tests and comment lines left out).
async function scan(dir: string) {
  const emits = new Set<string>();
  const listens = new Set<string>();
  const provides = new Set<string>();
  const dynamic: string[] = [];
  for (const file of new Bun.Glob("**/*.ts").scanSync(dir)) {
    if (file.startsWith("tests/") || file.endsWith(".test.ts")) continue;
    const text = (await Bun.file(join(dir, file)).text())
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    for (const m of text.matchAll(/\bhost\.(emit|on)\(\s*"([^"]+)"/g)) (m[1] === "emit" ? emits : listens).add(m[2]);
    for (const m of text.matchAll(/\bhost\.provide(?:<[^>]*>)?\(\s*"([^"]+)"/g)) provides.add(m[1]);
    // sound/index.ts hears its events through the constant array EVENTS and a loop over it.
    const list = /\bconst EVENTS\b[^=]*=\s*\[([\s\S]*?)\]/.exec(text);
    const loop = /for \(const (\w+) of EVENTS\)\s*host\.on\(\1,/.test(text);
    if (list && loop) for (const m of list[1].matchAll(/"([^"]+)"/g)) listens.add(m[1]);
    // Any other call whose name is not a literal cannot be checked.
    const calls = [...text.matchAll(/\bhost\.(?:emit|on|provide(?:<[^>]*>)?)\(\s*[^"\s]/g)].length;
    if (calls > (loop ? 1 : 0)) dynamic.push(file);
  }
  return { emits, listens, provides, dynamic };
}

const sorted = (set: Iterable<string>) => [...set].sort();

describe("plugin.json matches the code", () => {
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name);
    if (!existsSync(join(dir, "plugin.json"))) continue;

    test(`${name}: every event and API in the code is listed`, async () => {
      const manifest: Manifest = await Bun.file(join(dir, "plugin.json")).json();
      const code = await scan(dir);
      expect(manifest.name).toBe(name);
      expect(code.dynamic, "calls with a computed name").toEqual([]);
      expect(sorted(code.emits).filter((e) => !manifest.events.emits.includes(e)), "emitted but not in emits").toEqual([]);
      expect(sorted(code.listens).filter((e) => !manifest.events.listens.includes(e)), "heard but not in listens").toEqual([]);
      expect(sorted(code.provides).filter((e) => !manifest.provides.includes(e)), "provided but not in provides").toEqual([]);
    });

    // A plugin with no index.ts is only planned (visits): it has no code to match.
    if (!existsSync(join(dir, "index.ts"))) continue;
    test(`${name}: nothing is listed that the code never does`, async () => {
      const manifest: Manifest = await Bun.file(join(dir, "plugin.json")).json();
      const code = await scan(dir);
      expect(manifest.events.emits.filter((e) => !code.emits.has(e)), "in emits, never emitted").toEqual([]);
      expect(manifest.events.listens.filter((e) => !code.listens.has(e)), "in listens, never heard").toEqual([]);
      expect(manifest.provides.filter((e) => !code.provides.has(e)), "in provides, never provided").toEqual([]);
    });
  }
});
