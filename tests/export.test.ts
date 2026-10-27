import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { exportSite } from "../tools/export.ts";
import { serveFolder } from "./e2e/helpers.ts";

const root = join(import.meta.dir, "..");
const site = join(root, "site");
const out = mkdtempSync(join(tmpdir(), "nws-export-test-"));
const commit = "0123456789abcdef0123456789abcdef01234567";
let hash: string;
let host: ReturnType<typeof serveFolder>;

beforeAll(async () => {
  hash = await exportSite({ out, origin: "https://northwhale.example/", commit });
  host = serveFolder(out);
});
afterAll(() => {
  host.stop();
  rmSync(out, { recursive: true, force: true });
});

const files = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)));
const text = (name: string) => Bun.file(join(out, name)).text();

describe("export", () => {
  test("the page links the bundle under its hash and has an absolute og:image", async () => {
    const html = await text("index.html");
    expect(html).toContain(`/app.js?v=${hash}`);
    expect(html).toContain(`/app.css?v=${hash}`);
    expect(html).toContain('<meta property="og:image" content="https://northwhale.example/og.jpg" />');
    expect(html).not.toMatch(/%V%|%OG_IMAGE%/);
  });

  test("the bundle is the one the hash names", async () => {
    const js = await text("app.js");
    const css = await text("app.css");
    const sha = new Bun.CryptoHasher("sha1").update(js).update(css).digest("hex").slice(0, 10);
    expect(sha).toBe(hash);
  });

  test("no page loads the bug widget or names the tailnet", async () => {
    for (const name of ["index.html", "404.html"]) {
      const html = await text(name);
      expect(html, name).not.toContain("widget.js");
      expect(html, name).not.toContain("ts.net");
    }
  });

  test("every site/ file is there, byte for byte in size", () => {
    const got = new Set(files(out));
    for (const f of files(site)) {
      expect(got.has(f), f).toBe(true);
      if (!f.endsWith(".html")) expect(statSync(join(out, f)).size, f).toBe(statSync(join(site, f)).size);
    }
  });

  test("every address the pages and the bundle name is a file of the export", async () => {
    const sources = await Promise.all(["index.html", "404.html", "app.js", "app.css"].map(text));
    const named = new Set<string>();
    for (const s of sources) for (const m of s.matchAll(/\/(?:media|fonts)\/[\w.-]+\.\w+|\/[\w-]+\.(?:svg|jpg|webp|png|woff2)\b/g)) named.add(m[0]);
    expect(named.size).toBeGreaterThan(40);
    for (const path of named) expect(await Bun.file(join(out, path)).exists(), path).toBe(true);
  });

  test("/health answers the commit through the host's rewrite", async () => {
    expect(await text("_redirects")).toMatch(/^\/health\s+\/health\.json\s+200$/m);
    expect(await (await fetch(`${host.url}/health`)).json()).toEqual({ ok: true, commit });
  });

  test("cache rules: the page is checked every visit, the bundle kept for good, media and fonts a day", async () => {
    const rules = await text("_headers");
    const rule = (path: string) => new RegExp(`^${path.replace(/[.*]/g, "\\$&")}\\n\\s+Cache-Control: ([^\\n]+)`, "m").exec(rules)?.[1];
    expect(rule("/")).toBe("no-cache");
    expect(rule("/index.html")).toBe("no-cache");
    expect(rule("/app.js")).toBe("public, max-age=31536000, immutable");
    expect(rule("/app.css")).toBe("public, max-age=31536000, immutable");
    expect(rule("/media/*")).toBe("public, max-age=86400");
    expect(rule("/fonts/*")).toBe("public, max-age=86400");
  });

  test("a missing address gets the 404 page", async () => {
    const res = await fetch(`${host.url}/no-such-page`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Такой страницы нет");
  });

  test("bun run export needs PUBLIC_ORIGIN and writes dist with it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nws-export-cli-"));
    try {
      const env = { ...process.env, PUBLIC_ORIGIN: "" };
      const bare = Bun.spawnSync(["bun", "tools/export.ts", "--out", dir], { cwd: root, env, stderr: "pipe" });
      expect(bare.exitCode).not.toBe(0);
      expect(bare.stderr.toString()).toContain("PUBLIC_ORIGIN is not set");

      const run = Bun.spawnSync(["bun", "run", "export", "--out", dir], { cwd: root, stderr: "pipe" });
      expect(run.exitCode, run.stderr.toString()).toBe(0);
      expect(await Bun.file(join(dir, "index.html")).text()).toContain('content="https://northwhale.studio/og.jpg"');
      expect((await Bun.file(join(dir, "health.json")).json()).commit).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
