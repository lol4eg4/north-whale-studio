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

// The page is made once per bundle (each time in dev, where index.html may change too).
let made: { hash: string; html: string; gz: Uint8Array<ArrayBuffer> } | null = null;
async function page(req: Request, b: Bundle): Promise<Response> {
  if (dev || made?.hash !== b.hash) {
    const html = (await Bun.file(join(root, "index.html")).text())
      .replaceAll("%V%", b.hash)
      .replaceAll("%OG_IMAGE%", `${publicOrigin}/og.jpg`);
    made = { hash: b.hash, html, gz: Bun.gzipSync(html) as Uint8Array<ArrayBuffer> };
  }
  const headers: Record<string, string> = { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-cache", Vary: "Accept-Encoding" };
  if (!acceptsGzip(req)) return new Response(made.html, { headers });
  headers["Content-Encoding"] = "gzip";
  return new Response(made.gz, { headers });
}

// "gzip" listed in Accept-Encoding and not refused with q=0.
function acceptsGzip(req: Request): boolean {
  return (req.headers.get("accept-encoding") ?? "").split(",").some((part) => {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return name.trim() === "gzip" && (q === undefined || Number(q.slice(2)) > 0);
  });
}

function asset(req: Request, b: Bundle, body: string, gz: Uint8Array<ArrayBuffer>, type: string): Response {
  // Cached for good only under the current bundle's own address (?v=<hash>).
  const current = new URL(req.url).searchParams.get("v") === b.hash;
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": current ? "public, max-age=31536000, immutable" : "no-cache",
    Vary: "Accept-Encoding",
  };
  if (acceptsGzip(req)) {
    headers["Content-Encoding"] = "gzip";
    return new Response(gz, { headers });
  }
  return new Response(body, { headers });
}

Bun.serve({
  hostname: "127.0.0.1",
  port,
  development: false, // never show error details to visitors
  async fetch(req) {
    const res = await route(req);
    res.headers.set("X-Content-Type-Options", "nosniff");
    return res;
  },
  error(e) {
    console.error(e);
    return new Response("Server error", { status: 500 });
  },
});
console.log(`Serving site/ on http://127.0.0.1:${port}`);

const notFound = () => new Response("Not found", { status: 404 });

async function route(req: Request): Promise<Response> {
  // Fixed routes match the address exactly: other spellings that normalize to "/" (like
  // "//host/..%2f") must not get the page, whose scripts build links from location.pathname.
  const raw = new URL(req.url).pathname;
  if (raw === "/health") return Response.json({ ok: true, commit });
  if (raw === "/" || raw === "/index.html") return page(req, await current());
  if (raw === "/app.js") {
    const b = await current();
    return asset(req, b, b.js, b.jsGz, "text/javascript;charset=utf-8");
  }
  if (raw === "/app.css") {
    const b = await current();
    return asset(req, b, b.css, b.cssGz, "text/css;charset=utf-8");
  }
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return notFound(); // malformed percent-encoding
  }
  // Files only under their plain name: no "..", "//", null bytes, folders or the page template.
  if (path !== normalize(path) || path.includes("\0") || path.endsWith("/") || path === "/index.html") return notFound();
  let file = Bun.file(join(root, path));
  if (!file.name!.startsWith(`${root}/`) || !(await file.exists())) file = Bun.file(join(root, "404.html"));
  if (!(await file.exists())) return notFound();
  const res = new Response(file, { status: file.name!.endsWith("/404.html") ? 404 : 200 });
  if (path.startsWith("/media/") || path.startsWith("/fonts/")) res.headers.set("Cache-Control", "public, max-age=86400");
  return res;
}
