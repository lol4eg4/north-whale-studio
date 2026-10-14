// Sound: off on the first visit, a click turns it on (a live AudioContext), a reload keeps the
// choice. Chromium runs with autoplay allowed so the context can start in a headless browser.
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

  test("plan B turns the sound on and plays the whale song", async () => {
    const { context, page, errors } = await open(browser, server.url);
    await context.addInitScript(() => {
      const w = window as unknown as { __played: HTMLMediaElement[] };
      w.__played = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        w.__played.push(this);
        return play.call(this);
      };
    });
    await page.reload({ waitUntil: "load" });
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    const planB = page.getByRole("button", { name: "План Б: пусть кит споёт" });
    await planB.click();
    expect(await page.locator(".ctrl .sound-btn").getAttribute("aria-pressed")).toBe("true");
    const song = () =>
      page.evaluate(() => {
        const m = (window as unknown as { __played: HTMLMediaElement[] }).__played.find((el) => el.src.endsWith("/media/whale-song.m4a"));
        return m && { time: m.currentTime, paused: m.paused, error: m.error?.code ?? 0 };
      });
    for (let i = 0; i < 50 && !((await song())?.time ?? 0); i++) await page.waitForTimeout(100);
    expect(await song()).toMatchObject({ paused: false, error: 0 });
    expect((await song())!.time).toBeGreaterThan(0);
    // A second press stops it.
    await planB.click();
    expect((await song())!.paused).toBe(true);
    await context.close();
    expect(errors).toEqual([]);
  });
});
