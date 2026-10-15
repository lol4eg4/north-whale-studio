// Bundles the page in memory: platform/main.ts plus the plugins the app file enables.
//
//   app.json --> virtual module "app:plugins" --> platform/main.ts --> Bun.build --> app.js + app.css
//                (enabled: plugins/<n>/index.ts, disabled: off.ts; sorted by layer)
//
// The build fails when a plugin reaches into another plugin, a ui part reaches into a
// plugin, or plugin.json "uses" goes up a layer or round in a circle.
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { BunPlugin } from "bun";

export interface Bundle {
  js: string;
  css: string;
  jsGz: Uint8Array<ArrayBuffer>;
  cssGz: Uint8Array<ArrayBuffer>;
  hash: string;
}

interface AppEntry {
  name: string;
  on: boolean;
}

interface PluginMeta {
  name: string;
  layer: number;
  uses?: string[];
}

export async function build(appFile = "app.json", root = import.meta.dir): Promise<Bundle> {
  const app: { plugins: AppEntry[] } = await Bun.file(join(root, appFile)).json();
  const metas = new Map<string, PluginMeta>();
  for (const entry of app.plugins) {
    const meta: PluginMeta = await Bun.file(join(root, "plugins", entry.name, "plugin.json")).json();
    if (meta.name !== entry.name) throw new Error(`plugins/${entry.name}/plugin.json names "${meta.name}"`);
    const file = join(root, "plugins", entry.name, entry.on ? "index.ts" : "off.ts");
    if (!(await Bun.file(file).exists())) throw new Error(`${relative(root, file)} is missing`);
    metas.set(entry.name, meta);
  }
  checkUses(appFile, metas);

  // Stable sort: layer first, then the page order of the app file.
  const order = [...app.plugins].sort((a, b) => metas.get(a.name)!.layer - metas.get(b.name)!.layer);
  const entry =
    order
      .map((p, i) => `import p${i} from ${JSON.stringify(join(root, "plugins", p.name, p.on ? "index.ts" : "off.ts"))};`)
      .join("\n") +
    `\nexport default [${order
      .map((p, i) => `{name:${JSON.stringify(p.name)},layer:${metas.get(p.name)!.layer},init:p${i}}`)
      .join(",")}];\n`;

  let result;
  try {
    result = await Bun.build({
      entrypoints: [join(root, "platform", "main.ts")],
      target: "browser",
      minify: true,
      define: { __MEDIA__: JSON.stringify(await mediaVersions(root)) },
      plugins: [appPlugins(entry), importRules(root)],
    });
  } catch (e) {
    const errors = (e as AggregateError).errors ?? [e];
    throw new Error(errors.map((x: unknown) => String((x as Error).message ?? x)).join("\n"));
  }
  let js = "";
  let css = "";
  for (const out of result.outputs) {
    if (out.path.endsWith(".js")) js += await out.text();
    else if (out.path.endsWith(".css")) css += await out.text();
  }
  const hash = createHash("sha1").update(js).update(css).digest("hex").slice(0, 10);
  const gz = (text: string) => Bun.gzipSync(text) as Uint8Array<ArrayBuffer>;
  return { js, css, jsGz: gz(js), cssGz: gz(css), hash };
}

// Each site/media file's content hash. The page asks for /media/<file>?v=<hash>, so a picture or
// video replaced under the same name gets a new address: no browser shows the old one from its cache.
async function mediaVersions(root: string): Promise<Record<string, string>> {
  const dir = join(root, "site", "media");
  const versions: Record<string, string> = {};
  // A root without a media folder (the build tests' small sites) has nothing to version.
  const entries = await readdir(dir, { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [];
    throw e;
  });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const bytes = new Uint8Array(await Bun.file(join(dir, entry.name)).arrayBuffer());
    versions[`/media/${entry.name}`] = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
  }
  return versions;
}

function checkUses(appFile: string, metas: Map<string, PluginMeta>) {
  for (const [name, meta] of metas) {
    for (const used of meta.uses ?? []) {
      const target = metas.get(used);
      if (!target) throw new Error(`${name} uses ${used}, which ${appFile} does not list`);
      if (target.layer > meta.layer)
        throw new Error(`${name} (layer ${meta.layer}) uses ${used} (layer ${target.layer}): calls never go up a layer`);
    }
  }
  const state = new Map<string, "open" | "done">();
  const visit = (name: string, path: string[]) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "open") throw new Error(`plugin.json "uses" goes round in a circle: ${[...path, name].join(" -> ")}`);
    state.set(name, "open");
    for (const used of metas.get(name)!.uses ?? []) visit(used, [...path, name]);
    state.set(name, "done");
  };
  for (const name of metas.keys()) visit(name, []);
}

function appPlugins(source: string): BunPlugin {
  return {
    name: "app-plugins",
    setup(b) {
      b.onResolve({ filter: /^app:plugins$/ }, () => ({ path: "app:plugins", namespace: "app" }));
      b.onLoad({ filter: /.*/, namespace: "app" }, () => ({ contents: source, loader: "js" }));
    },
  };
}

function importRules(root: string): BunPlugin {
  return {
    name: "import-rules",
    setup(b) {
      b.onResolve({ filter: /^\.{1,2}\// }, (args) => {
        if (!args.importer || args.namespace === "app") return undefined;
        const from = relative(root, args.importer).split(sep);
        const to = relative(root, join(dirname(args.importer), args.path)).split(sep);
        if (from[0] === "plugins" && !(to[0] === "platform" || (to[0] === "plugins" && to[1] === from[1])))
          throw new Error(`${from.join("/")} imports ${to.join("/")}: a plugin reaches other plugins only through the host`);
        if (from[0] === "platform" && from[1] === "ui" && to[0] === "plugins")
          throw new Error(`${from.join("/")} imports ${to.join("/")}: ui parts never import a plugin`);
        return undefined;
      });
    },
  };
}
