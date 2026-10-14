// Shared e2e fixtures: a server for one app file on a free port, a Chromium page that records
// console errors, and the wall hole counter.
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright-core";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");

export async function startServer(app = "app.json", env: Record<string, string> = {}) {
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

export async function launch(): Promise<Browser> {
  return chromium.launch();
}

// Phone-like context: touch, coarse pointer, small screen.
export const phone: BrowserContextOptions = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

export async function open(browser: Browser, url: string, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("widget.js")) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => {
    // Media aborted on purpose by a test or by the browser pausing a video is not a failure.
    if (!r.url().includes("/media/") && !r.url().includes("widget.js")) errors.push(`request failed: ${r.url()}`);
  });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

// Empty grid slots inside the wall, from the cells' layout boxes (pieces' translate does not count).
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
    const last = Math.max(...taken);
    for (let k = 0; k < last; k++) if (!taken.has(k)) holes++;
    return { cols, holes };
  });
}
