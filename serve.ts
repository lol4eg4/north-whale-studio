// Serves the site: the page bundle (built in memory at start), site/ files and /health.
// Staging and each task's test site run it with PORT set; DEV=1 (paneweb) rebuilds after edits.
import { watch } from "node:fs";
import { join, normalize } from "node:path";
import { build, type Bundle } from "./build.ts";

const port = Number(process.env.PORT);
if (!port) throw new Error("PORT is not set.");
const appFile = process.env.APP ?? "app.json";
const dev = process.env.DEV === "1";
// og:image needs an absolute address; it comes only from configuration, never from request headers.
const publicOrigin = (process.env.PUBLIC_ORIGIN ?? "").replace(/\/+$/, "");
const root = join(import.meta.dir, "site");
// /health: the commit this server runs, which the board's Release check waits for.
const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: import.meta.dir }).stdout.toString().trim() || null;

let bundle: Bundle;
try {
  bundle = await build(appFile);
} catch (e) {
  console.error(`Build failed:\n${(e as Error).message}`);
  process.exit(1);
}

let dirty = false;
if (dev) {
  for (const dir of ["platform", "plugins"]) watch(join(import.meta.dir, dir), { recursive: true }, () => (dirty = true));
  watch(join(import.meta.dir, appFile), () => (dirty = true));
}

async function current(): Promise<Bundle> {
  if (dirty) {
    dirty = false;
    try {
      bundle = await build(appFile);
    } catch (e) {
      console.error(`Rebuild failed, serving the last good bundle:\n${(e as Error).message}`);
    }
  }
  return bundle;
}

async function page(b: Bundle): Promise<Response> {
  const html = (await Bun.file(join(root, "index.html")).text())
    .replaceAll("%V%", b.hash)
    .replaceAll("%OG_IMAGE%", `${publicOrigin}/og.jpg`);
  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-cache" } });
}

function asset(req: Request, body: string, gz: Uint8Array<ArrayBuffer>, type: string): Response {
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
    Vary: "Accept-Encoding",
  };
  if ((req.headers.get("accept-encoding") ?? "").includes("gzip")) {
    headers["Content-Encoding"] = "gzip";
    return new Response(gz, { headers });
  }
  return new Response(body, { headers });
}

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    const res = await route(req);
    res.headers.set("X-Content-Type-Options", "nosniff");
    return res;
  },
});
console.log(`Serving site/ on http://127.0.0.1:${port}`);

async function route(req: Request): Promise<Response> {
  let path: string;
  try {
    path = normalize(decodeURIComponent(new URL(req.url).pathname));
  } catch {
    return new Response("Not found", { status: 404 }); // malformed percent-encoding
  }
  if (path === "/health") return Response.json({ ok: true, commit });
  if (path === "/" || path === "/index.html") return page(await current());
  if (path === "/app.js") {
    const b = await current();
    return asset(req, b.js, b.jsGz, "text/javascript;charset=utf-8");
  }
  if (path === "/app.css") {
    const b = await current();
    return asset(req, b.css, b.cssGz, "text/css;charset=utf-8");
  }
  let file = Bun.file(join(root, path.endsWith("/") ? `${path}index.html` : path));
  if (!file.name!.startsWith(`${root}/`) || !(await file.exists())) file = Bun.file(join(root, "404.html"));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  const res = new Response(file, { status: file.name!.endsWith("/404.html") ? 404 : 200 });
  if (path.startsWith("/media/") || path.startsWith("/fonts/")) res.headers.set("Cache-Control", "public, max-age=86400");
  return res;
}
