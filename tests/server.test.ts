import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { startServer } from "./e2e/helpers.ts";

// One GET with the path exactly as written; returns the whole answer as text.
async function raw(port: number, path: string): Promise<string> {
  let answer = "";
  const done = Promise.withResolvers<void>();
  const socket = await Bun.connect({
    hostname: "127.0.0.1",
    port,
    socket: {
      open: (s) => void s.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`),
      data: (_s, chunk) => void (answer += chunk.toString()),
      close: () => done.resolve(),
      error: (_s, e) => done.reject(e),
    },
  });
  await done.promise;
  socket.end();
  return answer;
}

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

  test("bundle is gzipped when asked and cached for good only under its own hash", async () => {
    const v = /\/app\.js\?v=([0-9a-f]{10})/.exec(await (await fetch(`${server.url}/`)).text())![1];
    const res = await fetch(`${server.url}/app.js?v=${v}`, { headers: { "Accept-Encoding": "gzip" }, decompress: false });
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    for (const query of ["", "?v=0000000000"]) {
      const other = await fetch(`${server.url}/app.js${query}`);
      expect(other.headers.get("cache-control"), query).toBe("no-cache");
    }
    const css = await fetch(`${server.url}/app.css?v=${v}`);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(css.headers.get("cache-control")).toContain("immutable");
  });

  test("gzip only when accepted: q=0 refuses it", async () => {
    const plain = await fetch(`${server.url}/`, { headers: { "Accept-Encoding": "gzip;q=0, identity" }, decompress: false });
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(await plain.text()).toContain("<!doctype html>");
    const gz = await fetch(`${server.url}/`, { headers: { "Accept-Encoding": "br, gzip" }, decompress: false });
    expect(gz.headers.get("content-encoding")).toBe("gzip");
  });

  test("files answer byte ranges (Safari video needs it)", async () => {
    const res = await fetch(`${server.url}/fonts/onest-latin-500-normal.woff2`, { headers: { Range: "bytes=0-99" } });
    expect(res.status).toBe(206);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
  });

  test("traversal, broken encoding, null bytes, folders and unknown paths are 404", async () => {
    for (const path of ["/../serve.ts", "/%2e%2e/serve.ts", "/%E0%A4%A", "/%00", "/fonts/", "/%69ndex.html", "/nope.txt"]) {
      const res = await fetch(`${server.url}${path}`);
      expect(res.status, path).toBe(404);
    }
  });

  test("a missing media file is a 404 that is not cached", async () => {
    const res = await fetch(`${server.url}/media/missing.m4a`);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBeNull();
  });

  test("encoded slashes cannot climb out of site/", async () => {
    // fetch keeps %2f as written, so the server decodes it itself.
    for (const path of ["/%2e%2e%2fserve.ts", "/..%2fpackage.json", "/media/..%2f..%2fserve.ts", "/%2e%2e/serve.ts"]) {
      const res = await fetch(`${server.url}${path}`);
      expect(res.status, path).toBe(404);
      expect(await res.text(), path).not.toMatch(/Bun\.serve|"name": "north-whale-studio"/);
    }
  });

  test("plain .. segments sent raw (fetch would normalize them) are 404", async () => {
    const port = Number(new URL(server.url).port);
    for (const path of ["/../serve.ts", "/%2e%2e/serve.ts", "/media/../../serve.ts", "/%2e%2e/%2e%2e/package.json"]) {
      const answer = await raw(port, path);
      expect(answer, path).toStartWith("HTTP/1.1 404");
      expect(answer, path).not.toMatch(/Bun\.serve|"name": "north-whale-studio"/);
    }
  });

  test("a video answers a byte range with 206, Content-Range and exactly the bytes asked", async () => {
    const res = await fetch(`${server.url}/media/c1-tile.mp4`, { headers: { Range: "bytes=0-99" } });
    expect(res.status).toBe(206);
    const size = Bun.file(join(import.meta.dir, "..", "site", "media", "c1-tile.mp4")).size;
    expect(res.headers.get("content-range")).toBe(`bytes 0-99/${size}`);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  test("only the plain address gets the page: a path that normalizes to / is 404", async () => {
    // The page builds links from location.pathname; "//host/..%2f" would make them leave the site.
    for (const path of ["//evil.example/..%2f", "//evil.example/x/..%2f..%2f"]) {
      const res = await fetch(`${server.url}${path}`, { redirect: "manual" });
      expect(res.status, path).toBe(404);
      expect(await res.text(), path).not.toContain("app.js");
    }
    expect((await fetch(`${server.url}/index.html`)).status).toBe(200);
  });
});
