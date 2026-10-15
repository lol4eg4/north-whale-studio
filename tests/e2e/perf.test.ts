// Slow 4G (AC 17): 1.6 Mbps down, 750 kbps up, 150 ms round trip, CPU 4x slower. The hero
// headline (in its own font) and the first case poster paint within 3 s; the first screen
// moves at most 450 KB. Videos and the music do not count: they start later on purpose.
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser, BrowserContextOptions } from "playwright-core";
import { launch, phone, startServer } from "./helpers.ts";

let server: Awaited<ReturnType<typeof startServer>>;
let browser: Browser;
beforeAll(async () => {
  server = await startServer();
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
  server?.stop();
});

// Runs in the page from the start: the frame after the headline has its font and after the
// first poster has loaded, in ms since navigation.
function watchPaint() {
  const seen: { headline?: number; poster?: number } = {};
  (window as unknown as { __paint: typeof seen }).__paint = seen;
  const posterLoaded = (tile: Element | null) => {
    const img = tile?.querySelector("img");
    if (img) return img.complete && img.naturalWidth > 0;
    const poster = tile?.querySelector("video")?.poster;
    return !!poster && performance.getEntriesByName(poster).some((e) => (e as PerformanceResourceTiming).responseEnd > 0);
  };
  const frame = () => {
    const h1 = document.querySelector(".hero h1");
    const text = h1?.textContent?.trim();
    if (!seen.headline && text && document.fonts.check("900 40px Rubik", text)) seen.headline = performance.now();
    if (!seen.poster && posterLoaded(document.querySelector(".wall .tile"))) seen.poster = performance.now();
    if (!seen.headline || !seen.poster) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function slowLoad(options: BrowserContextOptions) {
  const context = await browser.newContext({ locale: "ru-RU", ...options });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const urls = new Map<string, string>();
  const sizes = new Map<string, number>();
  cdp.on("Network.requestWillBeSent", (e) => urls.set(e.requestId, e.request.url));
  cdp.on("Network.loadingFinished", (e) => sizes.set(e.requestId, e.encodedDataLength));
  await page.addInitScript(watchPaint);
  await page.goto(server.url, { waitUntil: "load", timeout: 30_000 });
  await page.waitForFunction(() => {
    const p = (window as unknown as { __paint: { headline?: number; poster?: number } }).__paint;
    return p.headline && p.poster;
  }, null, { timeout: 20_000 });
  const paint = await page.evaluate(() => (window as unknown as { __paint: { headline: number; poster: number } }).__paint);
  await page.waitForTimeout(1500); // late first-screen requests (lazy posters near the fold)
  let bytes = 0;
  const counted: string[] = [];
  for (const [id, size] of sizes) {
    const url = urls.get(id) ?? "";
    if (/\.(mp4|m4a)(\?|$)/.test(url) || url.includes("widget.js")) continue;
    bytes += size;
    counted.push(`${Math.round(size / 1024)} KB ${url.replace(server.url, "")}`);
  }
  await context.close();
  return { paint, kb: Math.round(bytes / 1024), counted };
}

for (const [name, options] of [
  ["1440x900", { viewport: { width: 1440, height: 900 } }],
  ["390x844", phone],
] as const) {
  test(`slow 4G at ${name}: headline and first poster within 3 s, first screen <= 450 KB`, async () => {
    const r = await slowLoad(options);
    console.log(name, JSON.stringify({ headline: Math.round(r.paint.headline), poster: Math.round(r.paint.poster), kb: r.kb }));
    console.log(r.counted.join("\n"));
    expect(r.paint.headline).toBeLessThanOrEqual(3000);
    expect(r.paint.poster).toBeLessThanOrEqual(3000);
    expect(r.kb).toBeLessThanOrEqual(450);
  });
}
