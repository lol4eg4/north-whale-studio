// iPhone, emulated in Chromium (WebKit cannot run on this host; the owner checks a real phone):
// taps open cases, the dive button too, loops stay muted and inline, controls are thumb-sized,
// no mouse cursor.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { devices, type Browser } from "playwright-core";
import { launch, open, startServer } from "./helpers.ts";

const { defaultBrowserType: _, ...iphone } = devices["iPhone 13"];

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

test("iPhone: loads clean, no custom cursor, touch copy, loops muted and inline", async () => {
  const { context, page, errors } = await open(browser, server.url, iphone);
  await page.waitForTimeout(2600); // loops get their sources after 2 s
  expect(await page.locator(".cursor").count()).toBe(0);
  expect(await page.locator(".work-hint").textContent()).toBe("Держи, чтобы взять. Кит не против.");
  const videos = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLVideoElement>(".wall video")].map((v) => ({ muted: v.muted, inline: v.playsInline })),
  );
  expect(videos.length).toBe(8);
  for (const v of videos) expect(v).toEqual({ muted: true, inline: true });
  expect(errors).toEqual([]);
  await context.close();
});

test("iPhone: a tap opens the case full screen; the close button is thumb-sized and closes it", async () => {
  const { context, page, errors } = await open(browser, server.url, iphone);
  await page.locator(".wall .tile").first().tap();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(389);
  const close = dialog.locator(".case-x");
  const size = await close.boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(44);
  expect(size!.height).toBeGreaterThanOrEqual(44);
  await close.tap();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  expect(errors).toEqual([]);
  await context.close();
});

test("iPhone: header, corner and dock controls are at least 44 px", async () => {
  const { context, page } = await open(browser, server.url, iphone);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".nav a, .nav button, .ctrl button, .dock a, .dock button")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ el: `${el.tagName}.${el.className}`, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 44 || r.height < 44)
      .map(({ el, r }) => `${el} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  expect(small).toEqual([]);
  await context.close();
});

test("iPhone: tapping the dive button opens a random case within 3.5 s and leaves no roulette behind", async () => {
  const { context, page, errors } = await open(browser, server.url, iphone);
  const started = Date.now();
  await page.locator(".dive-btn").tap();
  await page.waitForFunction(() => !!document.querySelector("dialog.case[open]"), undefined, { timeout: 3500, polling: 50 });
  expect(Date.now() - started).toBeLessThan(3500);
  // The phone's slot reel fades out for a moment after the case opens; then nothing of the roll is left.
  const leftovers = () =>
    page.evaluate(() => ({
      rolling: document.documentElement.classList.contains("dive-rolling"),
      cells: document.querySelectorAll(".dive-dim, .dive-lit").length,
      reel: document.querySelectorAll(".dive-slot, .dive-slot-card").length,
      bubble: (() => {
        const b = document.querySelector<HTMLElement>(".dive-bubble")!;
        return b.hidden && b.textContent === "";
      })(),
    }));
  await page.waitForFunction(() => !document.querySelector(".dive-slot, .dive-slot-card"), undefined, { timeout: 2000 });
  await page.waitForTimeout(300);
  expect(await leftovers()).toEqual({ rolling: false, cells: 0, reel: 0, bubble: true });
  expect(errors).toEqual([]);
  await context.close();
});
