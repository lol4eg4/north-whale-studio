// The page as a whole: loads clean in both languages, never scrolls sideways, shows a case on
// the first screen, keeps the language, opens the menu below 1101 px, carries the bug widget.
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser, Page } from "playwright-core";
import { launch, open, phone, startServer } from "./helpers.ts";

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

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

// Share of the first case tile inside the viewport, without scrolling.
const firstTileShown = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector(".wall .tile")!.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return (w * h) / (r.width * r.height);
  });

test("loads in Russian and English with zero console errors and failed requests", async () => {
  for (const [path, lang] of [
    ["/", "ru"],
    ["/?lang=en", "en"],
  ]) {
    const { context, page, errors } = await open(browser, server.url + path);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang);
    expect(errors).toEqual([]);
    await context.close();
  }
});

test("no horizontal scroll at 320, 390, 768, 1024, 1280 and 1440 px", async () => {
  const { context, page } = await open(browser, server.url);
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    expect({ width, overflow: await overflow(page) }).toEqual({ width, overflow: 0 });
  }
  await context.close();
});

test("the first case tile shows without scrolling: 30 % at 1440x900, 50 % at 390x844", async () => {
  const desk = await open(browser, server.url);
  expect(await firstTileShown(desk.page)).toBeGreaterThanOrEqual(0.3);
  await desk.context.close();
  const ph = await open(browser, server.url, phone);
  expect(await firstTileShown(ph.page)).toBeGreaterThanOrEqual(0.5);
  await ph.context.close();
});

test("the language switch changes the page and survives a reload", async () => {
  const { context, page, errors } = await open(browser, server.url);
  const title = await page.title();
  await page.locator(".nav .lang button[lang=en]").click();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  expect(await page.title()).not.toBe(title);
  expect(await page.locator(".nav .lang button[lang=en]").getAttribute("aria-pressed")).toBe("true");
  await page.goto(server.url);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  expect(errors).toEqual([]);
  await context.close();
});

for (const [name, options] of [
  ["1024", { viewport: { width: 1024, height: 768 } }],
  ["390", phone],
] as const) {
  test(`menu at ${name}: «+» opens it, focus stays inside, Esc closes it`, async () => {
    const { context, page, errors } = await open(browser, server.url, options);
    await expect(page.locator(".nav .plus").isVisible()).resolves.toBe(true);
    await page.locator(".nav .plus").click();
    expect(await page.evaluate(() => (document.getElementById("menu") as HTMLDialogElement).open)).toBe(true);
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      const outside = await page.evaluate(() => {
        const a = document.activeElement;
        return !!a && a !== document.body && !a.closest("#menu");
      });
      expect(outside).toBe(false);
    }
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => (document.getElementById("menu") as HTMLDialogElement).open)).toBe(false);
    // The dialog's close event comes a task later.
    await page.waitForFunction(() => document.querySelector(".nav .plus")!.getAttribute("aria-expanded") === "false");
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("at 390 px the header shows the short «Написать» button", async () => {
  const { context, page } = await open(browser, server.url, phone);
  expect(await page.locator(".nav .hello-short").isVisible()).toBe(true);
  expect(await page.locator(".nav .hello-short").textContent()).toBe("Написать");
  expect(await page.locator(".nav .hello-pill").isVisible()).toBe(false);
  await context.close();
});

test("the served page carries the bug widget loader", async () => {
  const html = await (await fetch(server.url)).text();
  expect(html).toContain("widget.js");
});
