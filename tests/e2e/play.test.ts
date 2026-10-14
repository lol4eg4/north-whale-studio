// Play: drag with the mouse (5 px threshold, a drop never opens a case), touch hold-to-lift
// versus a plain swipe that scrolls, «Ныряй наугад» (animated and calm) and «Прибраться».
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

const caseOpen = (page: Page) => page.evaluate(() => !!document.querySelector("dialog.case[open]"));
const offset = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const el = document.querySelector<HTMLElement>(s)!;
    return { x: parseFloat(el.style.getPropertyValue("--dx") || "0"), y: parseFloat(el.style.getPropertyValue("--dy") || "0") };
  }, selector);
// Centre an element on screen (instantly, the page scrolls smoothly by default) and return its centre.
const centre = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const el = document.querySelector<HTMLElement>(s)!;
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);

async function mouseDrag(page: Page, from: { x: number; y: number }, dx: number, dy = 0) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
  await page.mouse.up();
}

test("mouse: 4 px is a click, 30 px drags the tile and the drop does not open it, a click opens it", async () => {
  const { context, page, errors } = await open(browser, server.url);
  const tile = ".wall .cell .tile";
  const at = await centre(page, tile);

  await mouseDrag(page, at, 4);
  expect(await offset(page, tile)).toEqual({ x: 0, y: 0 });
  await page.waitForTimeout(300);
  // Under 5 px the press is a plain click: the case opens. Close it again.
  expect(await caseOpen(page)).toBe(true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog.case[open]"));

  const again = await centre(page, tile);
  await mouseDrag(page, again, 30);
  expect((await offset(page, tile)).x).toBeCloseTo(30, 0);
  await page.waitForTimeout(500);
  expect(await caseOpen(page)).toBe(false);

  // After the 350 ms window a plain click opens the dropped tile.
  await page.waitForTimeout(400);
  await page.click(tile);
  await page.waitForFunction(() => !!document.querySelector("dialog.case[open]"), undefined, { timeout: 2000 });
  expect(errors).toEqual([]);
  await context.close();
});

test("touch: hold 300 ms then move lifts a sticker; a quick swipe scrolls the page instead", async () => {
  const { context, page, errors } = await open(browser, server.url, phone);
  const cdp = await context.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const sticker = await page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>(".wall .cell > .sticker[data-piece]")].find((s) => s.offsetParent)!;
    el.id = "e2e-sticker";
    return "#e2e-sticker";
  });

  // A swipe that starts at once scrolls, and the sticker stays home.
  let at = await centre(page, sticker);
  const before = await page.evaluate(() => scrollY);
  await touch("touchStart", at.x, at.y);
  for (let i = 1; i <= 12; i++) {
    await touch("touchMove", at.x, at.y - i * 20);
    await page.waitForTimeout(16);
  }
  await touch("touchEnd");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(before + 60);
  expect(await offset(page, sticker)).toEqual({ x: 0, y: 0 });

  // Hold, then move: the sticker lifts and follows the finger; the page does not scroll.
  at = await centre(page, sticker);
  const still = await page.evaluate(() => scrollY);
  await touch("touchStart", at.x, at.y);
  await page.waitForTimeout(300);
  expect(await page.evaluate((s) => document.querySelector(s)!.classList.contains("lifted"), sticker)).toBe(true);
  for (let i = 1; i <= 8; i++) {
    await touch("touchMove", at.x + i * 5, at.y + i * 5);
    await page.waitForTimeout(16);
  }
  await touch("touchEnd");
  await page.waitForTimeout(200);
  const moved = await offset(page, sticker);
  expect(moved.x).toBeCloseTo(40, 0);
  expect(moved.y).toBeCloseTo(40, 0);
  expect(await page.evaluate(() => scrollY)).toBe(still);
  expect(await page.evaluate((s) => document.querySelector(s)!.classList.contains("lifted"), sticker)).toBe(false);
  expect(await caseOpen(page)).toBe(false);
  expect(errors).toEqual([]);
  await context.close();
});

test("dive opens a random case within 3 s", async () => {
  const { context, page, errors } = await open(browser, server.url);
  const started = Date.now();
  await page.click(".dive-btn");
  expect(await page.evaluate(() => document.documentElement.classList.contains("dive-rolling"))).toBe(true);
  await page.waitForFunction(() => !!document.querySelector("dialog.case[open]"), undefined, { timeout: 3000, polling: 50 });
  expect(Date.now() - started).toBeLessThan(3000);
  expect(await page.evaluate(() => document.documentElement.classList.contains("dive-rolling"))).toBe(false);
  // The dock hides while the case is open.
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".dive-btn")!).visibility)).toBe("hidden");
  expect(errors).toEqual([]);
  await context.close();
});

test("Esc during the roll cancels it: no case opens", async () => {
  const { context, page } = await open(browser, server.url);
  await page.click(".dive-btn");
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3000);
  expect(await caseOpen(page)).toBe(false);
  expect(await page.evaluate(() => document.querySelectorAll(".dive-dim, .dive-lit").length)).toBe(0);
  await context.close();
});

test("calm: dive opens a case at once, without the roulette", async () => {
  const { context, page, errors } = await open(browser, server.url, { reducedMotion: "reduce" });
  const started = Date.now();
  await page.click(".dive-btn");
  await page.waitForFunction(() => !!document.querySelector("dialog.case[open]"), undefined, { timeout: 1000, polling: 20 });
  expect(Date.now() - started).toBeLessThan(800);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".dive-ring")!).animationName)).toBe("none");
  expect(errors).toEqual([]);
  await context.close();
});

test("the pause button stops the ring", async () => {
  const { context, page } = await open(browser, server.url);
  const ring = () => page.evaluate(() => getComputedStyle(document.querySelector(".dive-ring")!).animationPlayState);
  expect(await ring()).toBe("running");
  await page.click(".pause-btn");
  expect(await ring()).toBe("paused");
  await context.close();
});

test("tidy after a drag shows the count and brings the piece home", async () => {
  const { context, page, errors } = await open(browser, server.url);
  const pill = ".mani-pill";
  const at = await centre(page, pill);
  await mouseDrag(page, at, 60, 40);
  expect(await offset(page, pill)).toEqual({ x: 60, y: 40 });
  await page.waitForTimeout(100);
  expect(await page.locator(".tidy-n").textContent()).toBe("1");
  expect(await page.locator(".tidy-n").isVisible()).toBe(true);
  await page.waitForTimeout(400);
  await page.click(".tidy-btn");
  await page.waitForFunction(() => document.querySelector(".toast:not([hidden])")?.textContent === "Вернул на места: 1", undefined, { timeout: 2000 });
  expect(await offset(page, pill)).toEqual({ x: 0, y: 0 });
  expect(await page.locator(".tidy-n").isVisible()).toBe(false);
  // Nothing moved: the toast says so.
  await page.waitForTimeout(800);
  await page.click(".tidy-btn");
  await page.waitForFunction(() => document.querySelector(".toast:not([hidden])")?.textContent === "Всё и так на местах", undefined, { timeout: 2000 });
  expect(errors).toEqual([]);
  await context.close();
});
