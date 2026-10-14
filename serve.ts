// Static server for site/: the staging site and each task's test site.
import { join, normalize } from "node:path";

const port = Number(process.env.PORT);
if (!port) throw new Error("PORT is not set.");
const root = join(import.meta.dir, "site");
// /health: the commit this server runs, which the board's Release check waits for.
const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: import.meta.dir }).stdout.toString().trim() || null;

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    let path: string;
    try {
      path = normalize(decodeURIComponent(new URL(req.url).pathname));
    } catch {
      return new Response("Not found", { status: 404 }); // malformed percent-encoding
    }
    if (path === "/health") return Response.json({ ok: true, commit });
    let file = Bun.file(join(root, path.endsWith("/") ? `${path}index.html` : path));
    if (!file.name!.startsWith(`${root}/`) || !(await file.exists())) file = Bun.file(join(root, "404.html"));
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file, { status: file.name!.endsWith("/404.html") ? 404 : 200 });
  },
});
console.log(`Serving site/ on http://127.0.0.1:${port}`);
