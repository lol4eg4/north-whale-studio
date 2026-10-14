// The light version (APP=app.light.json: layers 0-1 only): the whole showcase, no play.
// The wall keeps no holes without the dive block, and nothing errors when play is missing.
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser } from "playwright-core";
import { launch, open, startServer, wallHoles } from "./helpers.ts";

let server: Awaited<ReturnType<typeof startServer>>;
let browser: Browser;
beforeAll(async () => {
  server = await startServer("app.light.json");
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
  server?.stop();
});

test("light version: no errors, no wall holes at any width", async () => {
  const { context, page, errors } = await open(browser, server.url);
  for (const width of [1440, 1280, 1100, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    const { holes } = await wallHoles(page);
    expect({ width, holes }).toEqual({ width, holes: 0 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  }
  expect(errors).toEqual([]);
  await context.close();
});

test("light version: no finale, no sound button; cases still open", async () => {
  const { context, page, errors } = await open(browser, server.url);
  expect(await page.locator("#finale").isVisible()).toBe(false);
  expect(await page.locator(".ctrl button").count()).toBe(1); // only the pause button
  await page.locator(".wall .tile").first().click();
  await page.waitForFunction(() => [...document.querySelectorAll("dialog")].some((d) => d.open));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => ![...document.querySelectorAll("dialog")].some((d) => d.open));
  expect(errors).toEqual([]);
  await context.close();
});
