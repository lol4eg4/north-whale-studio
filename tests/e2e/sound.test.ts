// Sound: off on the first visit, a click turns it on (a live AudioContext), a reload keeps the
// choice. With sound on the music loops (a looping buffer source, the file asked for only then); off,
// a hidden tab or a case video with its own sound fades it out. Chromium runs with autoplay allowed
// so the context can start in a headless browser.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { open, startServer } from "./helpers.ts";

let server: { url: string; stop: () => void };
let browser: Browser;

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
});
afterAll(async () => {
  await browser?.close();
  server?.stop();
});

// Counts the AudioContexts the page makes (nothing of the site is exposed for this).
function recordContexts() {
  const w = window as unknown as { AudioContext: typeof AudioContext; __contexts: AudioContext[] };
  const Base = w.AudioContext;
  w.__contexts = [];
  w.AudioContext = class extends Base {
    constructor(options?: AudioContextOptions) {
      super(options);
      w.__contexts.push(this);
    }
  };
}
const contexts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __contexts: AudioContext[] }).__contexts.map((c) => c.state));

describe("sound", () => {
  test("off on the first visit; a click turns it on; a reload remembers", async () => {
    const { context, page, errors } = await open(browser, server.url);
    await context.addInitScript(recordContexts);
    await page.reload({ waitUntil: "load" });
    const btn = page.locator(".ctrl .sound-btn");

    expect(await page.evaluate(() => [...document.querySelector(".ctrl")!.children].map((c) => c.className))).toEqual([
      "cbtn sound-btn",
      "divider",
      "cbtn pause-btn",
    ]);
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    expect(await btn.getAttribute("aria-label")).toBe("Звук сайта");
    expect(await contexts(page)).toEqual([]);

    await btn.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    expect(await btn.getAttribute("aria-label")).toBe("Звук сайта");
    await page.waitForFunction(() => (window as unknown as { __contexts: AudioContext[] }).__contexts[0]?.state === "running");
    expect(await contexts(page)).toEqual(["running"]);

    await page.reload({ waitUntil: "load" });
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    // The remembered choice wakes the sound on the visitor's first gesture.
    await page.mouse.click(700, 500);
    await page.waitForFunction(() => (window as unknown as { __contexts: AudioContext[] }).__contexts[0]?.state === "running");
    expect(await contexts(page)).toEqual(["running"]);

    // Off again: remembered too, and the context is suspended, never closed.
    await btn.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    expect((await contexts(page))[0]).not.toBe("closed");
    await page.reload({ waitUntil: "load" });
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("no Web Audio in the browser: no sound button, pause stays", async () => {
    const { context, page, errors } = await open(browser, server.url);
    await context.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w.AudioContext;
      delete w.webkitAudioContext;
    });
    await page.reload({ waitUntil: "load" });
    expect(await page.evaluate(() => [...document.querySelector(".ctrl")!.children].map((c) => c.className))).toEqual(["cbtn pause-btn"]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("the label follows the language", async () => {
    const { context, page } = await open(browser, `${server.url}/?lang=en`);
    const btn = page.locator(".ctrl .sound-btn");
    expect(await btn.getAttribute("aria-label")).toBe("Site sound");
    await btn.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    await page.locator(".nav-lang button[lang=ru]").click();
    expect(await btn.getAttribute("aria-label")).toBe("Звук сайта");
    await context.close();
  });

  // The page makes the music source itself and nothing of it is exposed: every looping buffer source
  // is recorded, with whether it was stopped.
  function watchMusic() {
    type Rec = { duration: number; stopped: boolean };
    const w = window as unknown as { __music: Rec[] };
    w.__music = [];
    const recs = new WeakMap<AudioBufferSourceNode, Rec>();
    const { start, stop } = AudioBufferSourceNode.prototype;
    AudioBufferSourceNode.prototype.start = function (...a: Parameters<typeof start>) {
      if (this.loop) {
        const rec = { duration: this.buffer?.duration ?? 0, stopped: false };
        recs.set(this, rec);
        w.__music.push(rec);
      }
      return start.apply(this, a);
    };
    AudioBufferSourceNode.prototype.stop = function (...a: Parameters<typeof stop>) {
      const rec = recs.get(this);
      if (rec) rec.stopped = true;
      return stop.apply(this, a);
    };
  }
  const MUSIC = "/media/music.m4a";
  const music = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __music: { duration: number; stopped: boolean }[]; __contexts: AudioContext[] };
      const m = w.__music.at(-1);
      return m && { ...m, sources: w.__music.length, context: w.__contexts[0]?.state };
    });
  const playing = (page: Page) =>
    page.waitForFunction(() => {
      const w = window as unknown as { __music: { duration: number; stopped: boolean }[]; __contexts: AudioContext[] };
      const m = w.__music.at(-1);
      return !!m && !m.stopped && m.duration > 30 && w.__contexts[0]?.state === "running";
    }, null, { timeout: 15000 });
  // Fade out is 1.5 s, then the source is stopped.
  const stopped = (page: Page) =>
    page.waitForFunction(() => (window as unknown as { __music: { stopped: boolean }[] }).__music.at(-1)?.stopped === true, null, { timeout: 8000 });
  async function openWatching(url: string, options = {}) {
    const { context, page, errors } = await open(browser, url, options);
    await context.addInitScript(watchMusic);
    await context.addInitScript(recordContexts);
    const requests: string[] = [];
    page.on("request", (r) => requests.push(new URL(r.url()).pathname));
    await page.reload({ waitUntil: "load" });
    return { context, page, errors, requests };
  }

  test("the music file is asked for only when sound is turned on; it loops and plays", async () => {
    const { context, page, errors, requests } = await openWatching(server.url);
    await page.waitForTimeout(600);
    await page.mouse.move(600, 400);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await page.waitForTimeout(400);
    expect(requests.filter((p) => p === MUSIC)).toEqual([]);
    expect(await music(page)).toBeUndefined();

    await page.locator(".ctrl .sound-btn").click();
    await playing(page);
    expect(await music(page)).toEqual({ duration: 30.72, stopped: false, sources: 1, context: "running" });
    expect(requests.filter((p) => p === MUSIC)).toEqual([MUSIC]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("sound off fades the music out, then pauses it and lets the file go; on again plays it", async () => {
    const { context, page, errors } = await openWatching(server.url);
    const btn = page.locator(".ctrl .sound-btn");
    await btn.click();
    await playing(page);
    await btn.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    expect((await music(page))!.stopped).toBe(false); // still fading
    await stopped(page);
    await btn.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    await playing(page);
    expect((await music(page))!.sources).toBe(2);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a remembered on starts the music on the first gesture, not before", async () => {
    const { context, page, errors, requests } = await openWatching(server.url);
    await page.locator(".ctrl .sound-btn").click();
    await playing(page);
    requests.length = 0;
    await page.reload({ waitUntil: "load" });
    expect(await page.locator(".ctrl .sound-btn").getAttribute("aria-pressed")).toBe("true");
    await page.waitForTimeout(600);
    expect(requests.filter((p) => p === MUSIC)).toEqual([]);
    expect(await music(page)).toBeUndefined();
    await page.mouse.click(700, 500);
    await playing(page);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a hidden tab fades the music out and releases it; shown again, it plays", async () => {
    const { context, page, errors } = await openWatching(server.url);
    const btn = page.locator(".ctrl .sound-btn");
    await btn.click();
    await playing(page);
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await setHidden(true);
    await stopped(page);
    await page.waitForFunction(() => (window as unknown as { __contexts: AudioContext[] }).__contexts[0]?.state === "suspended");
    expect(await btn.getAttribute("aria-pressed")).toBe("true"); // the choice stays
    await setHidden(false);
    await playing(page);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("plan B turns the sound on and plays the music; a second press turns it off", async () => {
    const { context, page, errors } = await openWatching(server.url);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    const planB = page.getByRole("button", { name: "План Б: пусть кит споёт" });
    const btn = page.locator(".ctrl .sound-btn");
    await planB.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    await playing(page);
    // A second press turns the sound off, like the button: remembered, and the music fades out.
    await planB.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    await stopped(page);
    await page.reload({ waitUntil: "load" });
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a case video with its own sound takes over; the music returns when the case closes", async () => {
    const { context, page, errors } = await openWatching(server.url);
    await page.locator(".ctrl .sound-btn").click();
    await playing(page);
    await page.click('.wall .tile[aria-label^="Кейс 3."]');
    await page.waitForSelector("dialog.case[open]");
    expect((await music(page))!.stopped).toBe(false); // the video has not started yet
    await page.click("dialog.case .go");
    await page.waitForFunction(() => {
      const v = document.querySelector<HTMLVideoElement>("dialog.case video")!;
      return !v.paused && !v.muted && v.currentTime > 0;
    }, null, { timeout: 10000 });
    await stopped(page);
    expect(await page.locator(".ctrl .sound-btn").getAttribute("aria-pressed")).toBe("true");
    await page.keyboard.press("Escape");
    await playing(page);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("music that cannot be loaded warns once and the effects keep working", async () => {
    const { context, page } = await open(browser, server.url);
    await context.addInitScript(recordContexts);
    const warnings: string[] = [];
    page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route("**/media/music.m4a", (route) => route.fulfill({ status: 404, body: "no" }));
    await page.reload({ waitUntil: "load" });
    const btn = page.locator(".ctrl .sound-btn");
    await btn.click();
    await page.waitForFunction(() => (window as unknown as { __contexts: AudioContext[] }).__contexts[0]?.state === "running");
    await page.waitForTimeout(800);
    await page.mouse.click(700, 500);
    await page.waitForTimeout(300);
    expect(warnings.filter((w) => w.includes("background music"))).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    expect(await contexts(page)).toEqual(["running"]);
    await context.close();
  });
});
