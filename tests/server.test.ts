import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startServer } from "./e2e/helpers.ts";

let server: Awaited<ReturnType<typeof startServer>>;
let withOrigin: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  server = await startServer();
  withOrigin = await startServer("app.json", { PUBLIC_ORIGIN: "https://northwhale.example/" });
});
afterAll(() => {
  server.stop();
  withOrigin.stop();
});

describe("serve.ts", () => {
  test("/health returns the commit", async () => {
    const res = await fetch(`${server.url}/health`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  test("the page links the built bundle and keeps the bug widget", async () => {
    const html = await (await fetch(`${server.url}/`)).text();
    expect(html).toMatch(/\/app\.js\?v=[0-9a-f]{10}/);
    expect(html).toMatch(/\/app\.css\?v=[0-9a-f]{10}/);
    expect(html).not.toContain("%V%");
    expect(html).toContain("pane-server.tail9feca9.ts.net:8446/widget.js");
    expect(html).toContain('content="/og.jpg"');
  });

  test("og:image is absolute only from PUBLIC_ORIGIN, never from request headers", async () => {
    const html = await (await fetch(`${withOrigin.url}/`, { headers: { "X-Forwarded-Host": "evil.example" } })).text();
    expect(html).toContain('content="https://northwhale.example/og.jpg"');
    expect(html).not.toContain("evil.example");
  });

  test("bundle is gzipped when asked and cached for good", async () => {
    const res = await fetch(`${server.url}/app.js`, { headers: { "Accept-Encoding": "gzip" }, decompress: false });
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const css = await fetch(`${server.url}/app.css`);
    expect(css.headers.get("content-type")).toContain("text/css");
  });

  test("files answer byte ranges (Safari video needs it)", async () => {
    const res = await fetch(`${server.url}/fonts/onest-latin-500-normal.woff2`, { headers: { Range: "bytes=0-99" } });
    expect(res.status).toBe(206);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
  });

  test("traversal, broken encoding and unknown paths are 404", async () => {
    for (const path of ["/../serve.ts", "/%2e%2e/serve.ts", "/%E0%A4%A", "/nope.txt"]) {
      const res = await fetch(`${server.url}${path}`);
      expect(res.status, path).toBe(404);
    }
  });
});
