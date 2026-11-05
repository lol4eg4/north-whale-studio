// Sound: off on the first visit, a click turns it on (a live AudioContext), a reload keeps the
// choice. Off or in a hidden tab the context sleeps. Plan B is the same switch as the button. The
// site has click sounds only: no music file is ever asked for. Chromium runs with autoplay allowed
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

  const state = (page: Page) => page.evaluate(() => (window as unknown as { __contexts: AudioContext[] }).__contexts[0]?.state);
  const inState = (page: Page, want: string) =>
    page.waitForFunction((w) => (window as unknown as { __contexts: AudioContext[] }).__contexts[0]?.state === w, want, { timeout: 5000 });
  async function openRecording(url: string, options = {}) {
    const { context, page, errors } = await open(browser, url, options);
    await context.addInitScript(recordContexts);
    const requests: string[] = [];
    page.on("request", (r) => requests.push(new URL(r.url()).pathname));
    await page.reload({ waitUntil: "load" });
    return { context, page, errors, requests };
  }

  test("turning sound on never asks for music: nothing under /media/music and no .m4a at all", async () => {
    const { context, page, errors, requests } = await openRecording(server.url);
    const btn = page.locator(".ctrl .sound-btn");
    await btn.click();
    await inState(page, "running");
    // A later gesture, a scroll to the end of the page, sound off and on again: the paths that once started the music.
    await page.mouse.click(700, 500);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await page.waitForTimeout(1500);
    await btn.click();
    await btn.click();
    await page.waitForTimeout(500);
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    expect(requests.filter((p) => p.startsWith("/media/music") || p.endsWith(".m4a"))).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("sound off suspends the context, never closes it; on again resumes it", async () => {
    const { context, page, errors } = await openRecording(server.url);
    const btn = page.locator(".ctrl .sound-btn");
    await btn.click();
    await inState(page, "running");
    await btn.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    await inState(page, "suspended");
    expect(await contexts(page)).toEqual(["suspended"]);
    await btn.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    await inState(page, "running");
    expect(await contexts(page)).toEqual(["running"]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a remembered on wakes the sound on the first gesture, not before", async () => {
    const { context, page, errors } = await openRecording(server.url);
    await page.locator(".ctrl .sound-btn").click();
    await inState(page, "running");
    await page.reload({ waitUntil: "load" });
    expect(await page.locator(".ctrl .sound-btn").getAttribute("aria-pressed")).toBe("true");
    await page.waitForTimeout(600);
    expect(await contexts(page)).toEqual([]);
    await page.mouse.click(700, 500);
    await inState(page, "running");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a hidden tab suspends the context; shown again, it runs", async () => {
    const { context, page, errors } = await openRecording(server.url);
    const btn = page.locator(".ctrl .sound-btn");
    await btn.click();
    await inState(page, "running");
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await setHidden(true);
    await inState(page, "suspended");
    expect(await btn.getAttribute("aria-pressed")).toBe("true"); // the choice stays
    await setHidden(false);
    await inState(page, "running");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("iPhone audio session: sound on asks to play like media, sound off gives it back", async () => {
    const { context, page, errors } = await open(browser, server.url);
    await context.addInitScript(() => {
      (navigator as unknown as { audioSession: { type: string } }).audioSession = { type: "auto" };
    });
    await page.reload({ waitUntil: "load" });
    const type = () => page.evaluate(() => (navigator as unknown as { audioSession: { type: string } }).audioSession.type);
    const btn = page.locator(".ctrl .sound-btn");
    expect(await type()).toBe("auto");
    await btn.click();
    expect(await type()).toBe("playback");
    await btn.click();
    expect(await type()).toBe("auto");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("plan B turns off the sound the sound button turned on", async () => {
    const { context, page, errors } = await openRecording(server.url);
    const btn = page.locator(".ctrl .sound-btn");
    await btn.click();
    await inState(page, "running");
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await page.getByRole("button", { name: "План Б: пусть кит споёт" }).click();
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    await inState(page, "suspended");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("plan B turns the sound on; a second press turns it off, remembered", async () => {
    const { context, page, errors } = await openRecording(server.url);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    const planB = page.getByRole("button", { name: "План Б: пусть кит споёт" });
    const btn = page.locator(".ctrl .sound-btn");
    await planB.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    await inState(page, "running");
    // A second press turns the sound off, like the button: remembered, and the context sleeps.
    await planB.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    await inState(page, "suspended");
    await page.reload({ waitUntil: "load" });
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    expect(errors).toEqual([]);
    await context.close();
  });
});
