// Writes the site as plain files for a static host (Netlify): the same page serve.ts gives.
//   bun run export                                   -> dist/ for https://northwhale.studio
//   PUBLIC_ORIGIN=<address> bun tools/export.ts [--out <folder>]
// The folder holds index.html (bundle hash in ?v=, absolute og:image), app.js, app.css, every
// site/ file, health.json with the commit (served at /health), and the host's _headers and
// _redirects from deploy/. The board's bug widget stays out: the public site never loads it.
import { cp, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { build } from "../build.ts";

const root = join(import.meta.dir, "..");

// The widget's comment line and <script>, as site/index.html and site/404.html carry them.
const widget = /\n[ \t]*<!-- The board's bug report widget[^\n]*-->\n[ \t]*<script>[^\n]*widget\.js[^\n]*<\/script>/;

// The export empties its folder first: never the repository, a folder holding it, or site/.
export function outFolder(path: string): string {
  const out = resolve(path);
  if (!relative(out, root).startsWith("..") || !relative(join(root, "site"), out).startsWith(".."))
    throw new Error(`--out ${out} would overwrite the repository or site/; pick a folder of its own, like dist`);
  return out;
}

export async function exportSite(opts: { out: string; origin: string; commit: string; app?: string }) {
  const origin = opts.origin.replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+$/.test(origin)) throw new Error(`PUBLIC_ORIGIN must be a site address like https://northwhale.studio, not "${opts.origin}"`);
  const out = outFolder(opts.out);
  const bundle = await build(opts.app ?? "app.json", root);

  await rm(out, { recursive: true, force: true });
  await cp(join(root, "site"), out, { recursive: true });
  for (const name of ["index.html", "404.html"]) {
    const html = await Bun.file(join(root, "site", name)).text();
    if (!widget.test(html)) throw new Error(`site/${name}: the bug widget script was not found, so the export cannot leave it out`);
    await Bun.write(
      join(out, name),
      html.replace(widget, "").replaceAll("%V%", bundle.hash).replaceAll("%OG_IMAGE%", `${origin}/og.jpg`),
    );
  }
  await Bun.write(join(out, "app.js"), bundle.js);
  await Bun.write(join(out, "app.css"), bundle.css);
  await Bun.write(join(out, "health.json"), JSON.stringify({ ok: true, commit: opts.commit }));
  for (const name of ["_headers", "_redirects"]) await cp(join(root, "deploy", name), join(out, name));
  return bundle.hash;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { out: { type: "string", default: "dist" } } });
  const origin = process.env.PUBLIC_ORIGIN;
  if (!origin) throw new Error("PUBLIC_ORIGIN is not set: og:image needs the site's full address.");
  const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root }).stdout.toString().trim();
  if (!commit) throw new Error("git rev-parse HEAD gave no commit: /health needs it.");
  const out = outFolder(values.out!);
  const hash = await exportSite({ out, origin, commit, app: process.env.APP });
  console.log(`Exported ${origin} (bundle ${hash}, commit ${commit.slice(0, 7)}) to ${out}`);
}
