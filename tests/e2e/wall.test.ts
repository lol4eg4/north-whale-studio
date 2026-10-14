// Wall: dense packing without holes, no sideways scroll, the first tile in view,
// lazy loops (nothing before 2 s, only near the screen), posters, no console errors.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser } from "playwright-core";
import { launch, open, phone, startServer, wallHoles } from "./helpers.ts";

const HOLE_WIDTHS = [1440, 1280, 1100, 1024, 768, 390, 320];
const SCROLL_WIDTHS = [320, 390, 768, 1024, 1280, 1440];
const colsAt = (w: number) => (w > 1100 ? 8 : w > 700 ? 6 : 2);

let full: { url: string; stop(): void };
let light: { url: string; stop(): void };
let browser: Browser;

beforeAll(async () => {
  [full, light, browser] = await Promise.all([startServer("app.json"), startServer("app.light.json"), launch()]);
});
afterAll(async () => {
  await browser?.close();
  full?.stop();
  light?.stop();
});

describe("wall layout", () => {
  for (const app of ["app.json", "app.light.json"]) {
    test(`no holes at ${HOLE_WIDTHS.join(", ")} px (${app})`, async () => {
      const base = app === "app.json" ? full.url : light.url;
      const { context, page, errors } = await open(browser, `${base}/?lang=ru`);
      const seen: string[] = [];
      for (const width of HOLE_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        const r = await wallHoles(page);
        seen.push(`${width}:${r.cols}/${r.holes}`);
        expect(r.cols, `columns at ${width}`).toBe(colsAt(width));
        expect(r.holes, `holes at ${width}`).toBe(0);
      }
      // The dive cell is the same size as an l tile, filled by the dive plugin or the whale fallback.
      const dive = await page.evaluate(() => {
        const cell = document.querySelector<HTMLElement>(".wall > .dive-cell")!;
        const tile = document.querySelector<HTMLElement>(".wall > .sz-l:not(.dive-cell)")!;
        const a = cell.getBoundingClientRect();
        const b = tile.getBoundingClientRect();
        const piece = cell.firstElementChild!.getBoundingClientRect();
        return { same: Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1, fills: piece.width >= a.width - 1 && piece.height >= a.height - 1, fallback: !!cell.querySelector(".whale-block") };
      });
      expect(dive.same).toBe(true);
      expect(dive.fills).toBe(true);
      if (app === "app.light.json") expect(dive.fallback).toBe(true);
      expect(errors).toEqual([]);
      console.log(app, seen.join(" "));
      await context.close();
    });
  }

  test("no horizontal scroll at 320 to 1440 px", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    for (const width of SCROLL_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
      expect(r.sw, `scroll width at ${width}`).toBeLessThanOrEqual(r.w);
    }
    expect(errors).toEqual([]);
    await context.close();
  });

  const firstTileShare = (page: import("playwright-core").Page) =>
    page.evaluate(() => {
      const r = document.querySelector(".wall .tile")!.getBoundingClientRect();
      return (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height;
    });

  test("first tile is at least 30 % in view at 1440x900, RU and EN", async () => {
    for (const lang of ["ru", "en"]) {
      const { context, page } = await open(browser, `${full.url}/?lang=${lang}`);
      expect(await firstTileShare(page)).toBeGreaterThanOrEqual(0.3);
      await context.close();
    }
  });

  test("first tile is at least 50 % in view on a 390x844 phone, RU and EN", async () => {
    for (const lang of ["ru", "en"]) {
      const { context, page } = await open(browser, `${full.url}/?lang=${lang}`, phone);
      expect(await firstTileShare(page)).toBeGreaterThanOrEqual(0.5);
      await context.close();
    }
  });
});

describe("wall media", () => {
  test("posters first; loops only after 2 s and only near the screen; max 3 loading at once", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    const loops: { id: number; at: number }[] = [];
    let loadAt = 0;
    page.on("request", (r) => {
      const m = /\/media\/c(\d)-(tile|phone)\.mp4/.exec(r.url());
      if (m) loops.push({ id: Number(m[1]), at: Date.now() });
    });
    page.on("load", () => (loadAt = Date.now()));
    await page.goto(`${full.url}/?lang=ru`, { waitUntil: "load" });
    if (!loadAt) loadAt = Date.now();
    await page.waitForTimeout(1500);
    expect(loops).toEqual([]);
    await page.waitForTimeout(3000);

    expect(loops.length).toBeGreaterThan(0);
    for (const l of loops) expect(l.at - loadAt, `loop ${l.id} asked ${l.at - loadAt} ms after load`).toBeGreaterThanOrEqual(1900);

    const tiles = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".wall .tile")].map((t) => {
        const r = t.getBoundingClientRect();
        const img = t.querySelector<HTMLImageElement>(".tile-poster")!;
        return { label: t.getAttribute("aria-label")!, top: r.top, bottom: r.bottom, poster: img.getAttribute("src"), src: t.querySelector("video")!.getAttribute("src") };
      }),
    );
    expect(tiles.length).toBe(8);
    const vh = 900;
    tiles.forEach((tile, i) => {
      const id = i + 1;
      expect(tile.label.startsWith(`Кейс ${id}.`)).toBe(true);
      const near = tile.top < 2 * vh && tile.bottom > -vh;
      // Posters, like loops, wait until their tile is within one screen of the viewport.
      expect(tile.poster, `poster of tile ${id}`).toBe(near ? `/media/c${id}.webp` : null);
      if (loops.some((l) => l.id === id)) expect(near, `tile ${id} loaded but is far from the screen`).toBe(true);
    });
    expect(loops.some((l) => l.id === 1)).toBe(true);
    expect(loops.some((l) => l.id === 8)).toBe(false);

    // Every poster answers, and the first one is painted.
    for (let id = 1; id <= 8; id++) expect((await fetch(`${full.url}/media/c${id}.webp`)).status, `c${id}.webp`).toBe(200);
    expect(await page.evaluate(() => (document.querySelector(".wall .tile-poster") as HTMLImageElement).naturalWidth > 0)).toBe(true);
    // The first tile plays its loop.
    expect(await page.evaluate(() => !(document.querySelector(".wall .tile video") as HTMLVideoElement).paused)).toBe(true);
    // Scrolling down the wall brings every poster in.
    for (let y = 0; y <= 3000; y += 600) {
      await page.evaluate((top) => scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".wall .tile-poster")].every((i) => i.complete && i.naturalWidth > 0));
    expect(errors).toEqual([]);
    await context.close();
  });

  test("calm: no loop is loaded or played", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const loops: string[] = [];
    page.on("request", (r) => /\/media\/c\d-(tile|phone)\.mp4/.test(r.url()) && loops.push(r.url()));
    await page.goto(`${full.url}/?lang=ru`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    expect(loops).toEqual([]);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".ticker-row")!).animationName)).toBe("none");
    await context.close();
  });

  test("phone loads phone posters and phone loops, at most 4 playing", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`, phone);
    await page.waitForTimeout(3500);
    const r = await page.evaluate(() => ({
      poster: (document.querySelector(".wall .tile-poster") as HTMLImageElement).currentSrc,
      src: document.querySelector(".wall .tile video")!.getAttribute("src"),
      playing: [...document.querySelectorAll<HTMLVideoElement>(".wall .tile video")].filter((v) => !v.paused).length,
    }));
    expect(r.poster.endsWith("/media/c1-phone.webp")).toBe(true);
    expect(r.src).toBe("/media/c1-phone.mp4");
    expect(r.playing).toBeLessThanOrEqual(4);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("the pause button stops the loops and the ticker", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    await page.waitForFunction(() => !(document.querySelector(".wall .tile video") as HTMLVideoElement).paused, null, { timeout: 8000 });
    await page.click(".pause-btn");
    await page.waitForTimeout(100);
    const r = await page.evaluate(() => ({
      loops: [...document.querySelectorAll<HTMLVideoElement>(".wall .tile video")].every((v) => v.paused),
      ticker: getComputedStyle(document.querySelector(".ticker-row")!).animationPlayState,
    }));
    expect(r.loops).toBe(true);
    expect(r.ticker).toBe("paused");
    await page.click(".pause-btn");
    await page.waitForFunction(() => !(document.querySelector(".wall .tile video") as HTMLVideoElement).paused, null, { timeout: 5000 });
    expect(errors).toEqual([]);
    await context.close();
  });

  test("opening a case pauses the wall loops; closing resumes them", async () => {
    const { context, page } = await open(browser, `${full.url}/?lang=ru`);
    await page.waitForFunction(() => !(document.querySelector(".wall .tile video") as HTMLVideoElement).paused, null, { timeout: 8000 });
    await page.click(".wall .tile");
    await page.waitForSelector("dialog.case[open]");
    expect(await page.evaluate(() => [...document.querySelectorAll<HTMLVideoElement>(".wall .tile video")].every((v) => v.paused))).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForSelector("dialog.case:not([open])", { state: "attached" });
    await page.waitForFunction(() => !(document.querySelector(".wall .tile video") as HTMLVideoElement).paused, null, { timeout: 5000 });
    await context.close();
  });
});
