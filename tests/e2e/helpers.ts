// Shared e2e fixtures: a server for one app file on a free port, a Chromium page that records
// console errors, and the wall hole counter.
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { exportSite } from "../../tools/export.ts";

const root = join(import.meta.dir, "..", "..");

// E2E_EXPORT=1 runs the browser tests on the exported site (tools/export.ts) as Netlify serves it.
export async function startServer(app = "app.json", env: Record<string, string> = {}) {
  if (process.env.E2E_EXPORT) return startExport(app, env.PUBLIC_ORIGIN ?? "https://northwhale.studio");
  const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
  const port = probe.port;
  probe.stop(true);
  const proc = Bun.spawn(["bun", "serve.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), APP: app, DEV: "", ...env },
    stdout: "ignore",
    stderr: "pipe",
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/health`)).ok) return { url, stop: () => proc.kill() };
    } catch {}
    await Bun.sleep(100);
  }
  proc.kill();
  throw new Error(`serve.ts did not start for ${app}: ${await new Response(proc.stderr).text()}`);
}

// The site exported for one app file into a temporary folder, served like Netlify serves dist/.
export async function startExport(app = "app.json", origin = "https://northwhale.studio") {
  const dir = mkdtempSync(join(tmpdir(), "nws-export-"));
  const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root }).stdout.toString().trim();
  await exportSite({ out: dir, origin, commit, app });
  const host = serveFolder(dir);
  return { url: host.url, dir, stop: () => (host.stop(), rmSync(dir, { recursive: true, force: true })) };
}

// A static host: a file by its path, / is index.html, deploy/_redirects' /health rewrite, and
// 404.html with status 404 for anything else. Text goes gzipped, as Netlify sends it; byte
// ranges come from Bun's file responses.
export function serveFolder(dir: string) {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      let path = decodeURIComponent(new URL(req.url).pathname);
      if (path === "/") path = "/index.html";
      if (path === "/health") path = "/health.json";
      let file = Bun.file(join(dir, normalize(path)));
      let status = 200;
      if (path !== normalize(path) || path.endsWith("/") || !(await file.exists())) {
        file = Bun.file(join(dir, "404.html"));
        status = 404;
      }
      if (!/\.(html|js|css|json|svg)$/.test(file.name!) || !req.headers.get("accept-encoding")?.includes("gzip"))
        return new Response(file, { status });
      const headers = { "Content-Type": file.type, "Content-Encoding": "gzip" };
      return new Response(Bun.gzipSync(await file.bytes()), { status, headers });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}

export async function launch(): Promise<Browser> {
  return chromium.launch();
}

// A media address without its content hash: "/media/c1.webp?v=1a2b3c4d" -> "/media/c1.webp".
export const plain = (url: string | null) => url?.replace(/\?v=[0-9a-f]+$/, "") ?? null;

// Phone-like context: touch, coarse pointer, small screen.
export const phone: BrowserContextOptions = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

// Russian browser by default, so "/" shows the Russian page; pass { locale: "en-US" } for English.
export async function open(browser: Browser, url: string, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU", ...options });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("widget.js")) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => {
    // Only a video the page itself detached (net::ERR_ABORTED on /media/) is not a failure.
    const detached = r.url().includes("/media/") && r.failure()?.errorText === "net::ERR_ABORTED";
    if (!detached && !r.url().includes("widget.js")) errors.push(`request failed: ${r.url()}`);
  });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

// Empty grid slots inside the wall, up to the end of the last row, from the cells' layout boxes
// (pieces' translate does not count).
export function wallHoles(page: Page): Promise<{ cols: number; holes: number }> {
  return page.evaluate(() => {
    const wall = document.querySelector<HTMLElement>(".wall")!;
    const cs = getComputedStyle(wall);
    const cols = cs.gridTemplateColumns.split(" ").length;
    const wr = wall.getBoundingClientRect();
    const padL = parseFloat(cs.paddingLeft);
    const colW = (wr.width - padL - parseFloat(cs.paddingRight) + parseFloat(cs.columnGap)) / cols;
    const rowH = parseFloat(cs.gridAutoRows) + parseFloat(cs.rowGap);
    const taken = new Set<number>();
    for (const c of wall.children) {
      if (getComputedStyle(c).display === "none") continue;
      const cr = c.getBoundingClientRect();
      const c0 = Math.round((cr.left - wr.left - padL) / colW);
      const r0 = Math.round((cr.top - wr.top - parseFloat(cs.paddingTop)) / rowH);
      const w = Math.round((cr.width + parseFloat(cs.columnGap)) / colW);
      const h = Math.round((cr.height + parseFloat(cs.rowGap)) / rowH);
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) taken.add((r0 + j) * cols + c0 + i);
    }
    let holes = 0;
    const end = (Math.floor(Math.max(...taken) / cols) + 1) * cols;
    for (let k = 0; k < end; k++) if (!taken.has(k)) holes++;
    return { cols, holes };
  });
}
