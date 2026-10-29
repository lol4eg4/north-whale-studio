// Wall: dense packing without holes, no sideways scroll, the first tile in view, still posters
// with a moving round badge, the hover (result plate, curled corner), lazy loops (nothing before
// 2 s, only near the screen, at most 3 loading), posters that stay when a loop fails, the four
// team badges (names, roles, photos, Maria's loop, roll call, opening big), the studio stickers on
// every screen, no console errors.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { launch, open, phone, plain, startServer, wallHoles } from "./helpers.ts";

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

  test("the whale, Telegram and «Ныряй глубже» stickers are on the wall at 1440, 768 and 390 px; Dear Passengers' client is FLEXUS", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const shown = await page.evaluate(() =>
        [".wall .whale-st", '.wall a.client[href^="https://t.me/"]', ".wall .deeper"].map((s) => {
          const r = document.querySelector(s)?.getBoundingClientRect();
          return !!r && r.width > 30 && r.height > 30;
        }),
      );
      expect(shown, `stickers at ${width}`).toEqual([true, true, true]);
    }
    expect(await page.$$eval(".wall .client b", (els) => els.map((e) => e.textContent))).toContain("FLEXUS");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("tablet (768 px): Skyeng is 3 columns wide beside Антикрус, the team block a 2x3 strip; 8 columns the team block is 3x2", async () => {
    const { context, page } = await open(browser, `${full.url}/?lang=ru`, { viewport: { width: 768, height: 1024 } });
    // Columns and rows a cell takes, from its box and the wall's grid tracks.
    const span = (sel: string) =>
      page.evaluate((s) => {
        const wall = document.querySelector<HTMLElement>(".wall")!;
        const cs = getComputedStyle(wall);
        const col = parseFloat(cs.gridTemplateColumns.split(" ")[0]);
        const row = parseFloat(cs.gridAutoRows);
        const gap = parseFloat(cs.columnGap);
        const r = document.querySelector(s)!.getBoundingClientRect();
        return [Math.round((r.width + gap) / (col + gap)), Math.round((r.height + gap) / (row + gap))];
      }, sel);
    expect(await span(".wall > .t3")).toEqual([3, 3]);
    expect(await span(".wall > .sz-fam")).toEqual([2, 3]);
    // «Привет!» fits the narrow strip: the block clips what overflows.
    for (const width of [701, 768, 1024, 1100]) {
      await page.setViewportSize({ width, height: 1024 });
      await page.waitForTimeout(150);
      const over = await page.evaluate(() => {
        const b = document.querySelector(".wall .team-big b")!;
        const r = document.createRange();
        r.selectNodeContents(b);
        return r.getBoundingClientRect().right - b.closest(".team-block")!.getBoundingClientRect().right;
      });
      expect(over, `«Привет!» past the block at ${width}`).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(150);
    expect(await span(".wall > .sz-fam")).toEqual([3, 2]);
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
  test("posters before loops; loops only after 2 s and only near the screen; max 3 loading at once", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // Loading = has a source and no canplay yet (the page's own definition); the peak is kept per page.
    await context.addInitScript(() => {
      const loading = new Set<EventTarget>();
      const w = window as unknown as { __peakLoading: number };
      w.__peakLoading = 0;
      addEventListener("canplay", (e) => void loading.delete(e.target!), true);
      new MutationObserver((list) => {
        for (const r of list) {
          if (!(r.target instanceof HTMLVideoElement)) continue;
          r.target.hasAttribute("src") ? loading.add(r.target) : loading.delete(r.target);
        }
        w.__peakLoading = Math.max(w.__peakLoading, loading.size);
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["src"] });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    const loops: { id: number; at: number }[] = [];
    const seq: string[] = []; // "poster:<id>" and "loop:<id>" in request order
    let loadAt = 0;
    page.on("request", (r) => {
      const m = /\/media\/c(\d+)-ring\.mp4/.exec(r.url());
      if (m) {
        loops.push({ id: Number(m[1]), at: Date.now() });
        seq.push(`loop:${m[1]}`);
      }
      const p = /\/media\/c(\d+)(-phone)?\.webp/.exec(r.url());
      if (p) seq.push(`poster:${p[1]}`);
    });
    page.on("load", () => (loadAt = Date.now()));
    await page.goto(`${full.url}/?lang=ru`, { waitUntil: "load" });
    if (!loadAt) loadAt = Date.now();
    await page.waitForTimeout(1500);
    expect(loops).toEqual([]);
    await page.waitForTimeout(3000);

    expect(loops.length).toBeGreaterThan(0);
    for (const l of loops) expect(l.at - loadAt, `loop ${l.id} asked ${l.at - loadAt} ms after load`).toBeGreaterThanOrEqual(1900);
    // Posters first: the first request for a picture comes before the first loop, and every tile
    // that asked for a loop had asked for its poster before.
    const firstPoster = seq.findIndex((s) => s.startsWith("poster:"));
    expect(firstPoster, `request order ${seq.join(" ")}`).toBeGreaterThanOrEqual(0);
    expect(firstPoster, `request order ${seq.join(" ")}`).toBeLessThan(seq.findIndex((s) => s.startsWith("loop:")));
    for (const l of loops) {
      const poster = seq.indexOf(`poster:${l.id}`);
      expect(poster, `poster of tile ${l.id} asked before its loop in ${seq.join(" ")}`).toBeGreaterThanOrEqual(0);
      expect(poster, `poster of tile ${l.id} asked before its loop in ${seq.join(" ")}`).toBeLessThan(seq.indexOf(`loop:${l.id}`));
    }
    // At most 3 loops loading at once, though more tiles are near.
    const peak = await page.evaluate(() => (window as unknown as { __peakLoading: number }).__peakLoading);
    expect(peak, "most loops loading at once").toBeGreaterThanOrEqual(1);
    expect(peak, "most loops loading at once").toBeLessThanOrEqual(3);

    const tiles = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".wall .tile")].map((t) => {
        const r = t.getBoundingClientRect();
        const img = t.querySelector<HTMLImageElement>(".tile-poster")!;
        return { label: t.getAttribute("aria-label")!, top: r.top, bottom: r.bottom, poster: img.getAttribute("src"), src: t.querySelector("video")!.getAttribute("src") };
      }),
    );
    // Tiles in wall order: the case ids, and the numbers the tiles say (each case's place in the list).
    const ids = [1, 2, 3, 4, 5, 9, 7, 8, 10, 11];
    const numbers = [1, 2, 3, 4, 5, 8, 6, 7, 9, 10];
    expect(tiles.length).toBe(10);
    const vh = 900;
    tiles.forEach((tile, i) => {
      const id = ids[i];
      expect(tile.label.startsWith(`Кейс ${numbers[i]}.`)).toBe(true);
      const near = tile.top < 2 * vh && tile.bottom > -vh;
      // Posters, like loops, wait until their tile is within one screen of the viewport.
      expect(plain(tile.poster), `poster of tile ${id}`).toBe(near ? `/media/c${id}.webp` : null);
      if (loops.some((l) => l.id === id)) expect(near, `tile ${id} loaded but is far from the screen`).toBe(true);
    });
    expect(loops.some((l) => l.id === 1)).toBe(true);
    expect(loops.some((l) => l.id === 8)).toBe(false);

    // Every poster answers, and the first one is painted.
    for (const id of ids) expect((await fetch(`${full.url}/media/c${id}.webp`)).status, `c${id}.webp`).toBe(200);
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

  test("every badge loop request aborted: posters stay, no video keeps a source, no loop is asked again within 5 s", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // The page's videos that fired an error, to know when the failures have happened.
    await context.addInitScript(() => {
      const failed = new Set<EventTarget>();
      (window as unknown as { __failedLoops: Set<EventTarget> }).__failedLoops = failed;
      addEventListener("error", (e) => e.target instanceof HTMLVideoElement && failed.add(e.target), true);
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    const asked: string[] = [];
    await page.route(/\/media\/c\d-ring\.mp4/, (route) => {
      asked.push(route.request().url());
      return route.abort();
    });
    await page.goto(`${full.url}/?lang=ru`, { waitUntil: "load" });

    // Tiles well inside the loading reach (one screen around the viewport) must all try and fail.
    const sure = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".wall .tile")].filter((t) => {
        const r = t.getBoundingClientRect();
        return r.top < 2 * innerHeight - 100 && r.bottom > -innerHeight + 100;
      }).length,
    );
    expect(sure).toBeGreaterThanOrEqual(3);
    await page.waitForFunction((n) => (window as unknown as { __failedLoops: Set<EventTarget> }).__failedLoops.size >= n, sure, { timeout: 15000 });
    // Sources attach about 2 s after load, so the first ask is not earlier.
    expect(asked.length).toBeGreaterThanOrEqual(sure);
    // The wall loads 3 loops at a time: as those fail, the next tile in reach asks for its own.
    // Check once every loop asked has failed and nothing new was asked for a second.
    const failed = () => page.evaluate(() => (window as unknown as { __failedLoops: Set<EventTarget> }).__failedLoops.size);
    for (let quiet = 0, seen = -1, waited = 0; quiet < 10; waited += 100) {
      expect(waited, "the loop requests settle within 15 s").toBeLessThan(15000);
      await page.waitForTimeout(100);
      const settled = asked.length === seen && (await failed()) >= new Set(asked).size;
      quiet = settled ? quiet + 1 : 0;
      seen = asked.length;
    }

    const state = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".wall .tile")].map((t) => {
          const img = t.querySelector<HTMLImageElement>(".tile-poster")!;
          const video = t.querySelector<HTMLVideoElement>("video")!;
          return {
            label: t.getAttribute("aria-label")!.slice(0, 8),
            hasPoster: img.hasAttribute("src"),
            posterDrawn: img.complete && img.naturalWidth > 0 && getComputedStyle(img).visibility === "visible" && !t.classList.contains("no-poster"),
            videoPlaying: !video.paused,
            videoSrc: video.getAttribute("src"),
          };
        }),
      );
    const check = (tiles: Awaited<ReturnType<typeof state>>, when: string) => {
      expect(tiles.filter((t) => t.hasPoster).length, `tiles with a poster ${when}`).toBeGreaterThanOrEqual(sure);
      for (const t of tiles) {
        expect(t.videoSrc, `source of ${t.label} ${when}`).toBeNull();
        expect(t.videoPlaying, `loop of ${t.label} playing ${when}`).toBe(false);
        if (t.hasPoster) expect(t.posterDrawn, `poster of ${t.label} visible ${when}`).toBe(true);
      }
    };
    check(await state(), "after the failure");

    // Nothing is asked again: the same loop list, each loop asked once.
    const before = [...asked];
    await page.waitForTimeout(5000);
    expect(asked, "loops asked again").toEqual(before);
    expect(new Set(asked).size, `a loop was asked twice: ${asked.join(" ")}`).toBe(asked.length);
    check(await state(), "5 s later");
    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test("calm: the case badges still play, the ticker stands; the pause button shows off and stops the loops", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`, { reducedMotion: "reduce" });
    const first = () => page.evaluate(() => !(document.querySelector(".wall .tile video") as HTMLVideoElement).paused);
    await page.waitForFunction(() => !(document.querySelector(".wall .tile video") as HTMLVideoElement).paused, null, { timeout: 8000 });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".ticker-row")!).animationName)).toBe("none");
    expect(await page.getAttribute(".pause-btn", "aria-pressed")).toBe("false");
    await page.click(".pause-btn");
    await page.waitForTimeout(100);
    expect(await first()).toBe(false);
    expect(await page.getAttribute(".pause-btn", "aria-pressed")).toBe("true");
    await page.click(".pause-btn");
    await page.waitForFunction(() => !(document.querySelector(".wall .tile video") as HTMLVideoElement).paused, null, { timeout: 5000 });
    expect(errors).toEqual([]);
    await context.close();
  });

  test("autoplay refused (an iPhone in Low Power Mode): posters stay, no retry loop; the first tap plays the loops", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
    // play() works only once the visitor has touched the page, as on an iPhone in Low Power Mode.
    // (Playwright's evaluate counts as a gesture, so the stub watches real presses instead.)
    await context.addInitScript(() => {
      const real = HTMLMediaElement.prototype.play;
      const w = window as unknown as { __plays: number };
      let touched = false;
      w.__plays = 0;
      addEventListener("pointerdown", () => (touched = true), true);
      HTMLMediaElement.prototype.play = function () {
        w.__plays++;
        if (!touched) return Promise.reject(new DOMException("No autoplay", "NotAllowedError"));
        return real.call(this);
      };
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto(`${full.url}/?lang=ru`, { waitUntil: "load" });
    await page.waitForFunction(() => (document.querySelector(".wall .tile video") as HTMLVideoElement).readyState >= 3, null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => ({
      plays: (window as unknown as { __plays: number }).__plays,
      playing: [...document.querySelectorAll<HTMLVideoElement>(".wall .tile video")].filter((v) => !v.paused).length,
      src: document.querySelector(".wall .tile video")!.getAttribute("src"),
    }));
    expect(before.playing).toBe(0);
    expect(before.src).toContain("/media/c1-ring.mp4");
    expect(before.plays).toBeGreaterThan(0);
    // No retry loop: scrolling brings more loops in reach, yet nothing asks to play again.
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as unknown as { __plays: number }).__plays)).toBe(before.plays);
    // The first tap plays every loop that is on screen and has its source.
    await page.mouse.click(700, 300);
    await page.waitForFunction(
      () => {
        const on = [...document.querySelectorAll<HTMLVideoElement>(".wall .tile video[src]")].filter((v) => {
          const r = v.closest(".tile")!.getBoundingClientRect();
          return r.bottom > 0 && r.top < innerHeight && v.readyState >= 3;
        });
        return on.length > 0 && on.every((v) => !v.paused);
      },
      null,
      { timeout: 3000 },
    );
    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test("phone loads phone posters and the same badge loops, at most 4 playing", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`, phone);
    await page.waitForTimeout(3500);
    const r = await page.evaluate(() => ({
      poster: (document.querySelector(".wall .tile-poster") as HTMLImageElement).currentSrc,
      src: document.querySelector(".wall .tile video")!.getAttribute("src"),
      playing: [...document.querySelectorAll<HTMLVideoElement>(".wall .tile video")].filter((v) => !v.paused).length,
    }));
    expect(plain(new URL(r.poster).pathname + new URL(r.poster).search)).toBe("/media/c1-phone.webp");
    expect(plain(r.src)).toBe("/media/c1-ring.mp4");
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

  test("media addresses carry the file's content hash, so a replaced picture is never shown from a cache", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    const src = await page.getAttribute(".wall .tile-poster", "src");
    expect(src).toMatch(/^\/media\/c1\.webp\?v=[0-9a-f]{8}$/);
    const hash = new Bun.CryptoHasher("sha1").update(await Bun.file(join(import.meta.dir, "..", "..", "site", "media", "c1.webp")).arrayBuffer()).digest("hex").slice(0, 8);
    expect(src).toBe(`/media/c1.webp?v=${hash}`);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a tile is a still poster: its only video is the round badge's loop", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    await page.waitForFunction(() => !(document.querySelector(".wall .tile video") as HTMLVideoElement).paused, null, { timeout: 8000 });
    const r = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".wall .tile")].map((t) => ({
        videos: t.querySelectorAll("video").length,
        inRing: !!t.querySelector(".tile-ring > video"),
        poster: t.querySelector(".tile-poster")!.tagName,
      })),
    );
    expect(r).toEqual(Array.from({ length: 10 }, () => ({ videos: 1, inRing: true, poster: "IMG" })));
    expect(plain(await page.evaluate(() => document.querySelector<HTMLVideoElement>(".wall .tile video")!.getAttribute("poster")))).toBe("/media/c1-ring.webp");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("Waldorf's tile: «В прессе» and four publication logos, drawn with its badge; other tiles show none", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    const seen = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".wall .tile .plate-seen")].map((s) => ({
          shown: !s.hidden,
          label: s.querySelector(".mono")?.textContent ?? null,
          logos: [...s.querySelectorAll(".logo-mark")].map((m) => [m.getAttribute("aria-label"), getComputedStyle(m).maskImage !== "none"]),
        })),
      );
    const before = await seen();
    expect(before[0].logos.every(([, drawn]) => !drawn)).toBe(true);
    await page.waitForSelector(".wall .tile .plate-seen.on", { timeout: 8000 });
    const after = await seen();
    expect(after[0]).toEqual({
      shown: true,
      label: "В прессе",
      logos: [
        ["Rolling Stone UK", true],
        ["Forbes Travel Guide", true],
        ["Condé Nast Traveler", true],
        ["Business Traveller", true],
      ],
    });
    expect(after.slice(1).every((s) => !s.shown && s.logos.length === 0)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("hover: the lemon result flies out only under the mouse, the corner curls; touch screens show the result", async () => {
    // Headless Chromium reports no hover; these settings give it a mouse.
    const mouse = await chromium.launch({ args: ["--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"] });
    const { context, page, errors } = await open(mouse, `${full.url}/?lang=ru`);
    const tile = page.locator(".wall .tile").nth(2); // Dear Passengers: the case with a result
    await tile.scrollIntoViewIfNeeded();
    const look = () =>
      tile.evaluate((t) => ({
        stat: Number(getComputedStyle(t.querySelector(".plate-stat")!).opacity),
        corner: t.querySelector<HTMLElement>(".tile-peel")!.offsetWidth,
      }));
    const before = await look();
    expect(await tile.evaluate((t) => [...t.querySelectorAll(".plate-stat")].map((s) => s.textContent))).toEqual(["100 млн+ органических просмотров", "500 тыс.+ вишлистов в Steam"]);
    expect(before.stat).toBe(0);
    expect(before.corner).toBeGreaterThan(0);
    await tile.hover({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(700);
    const over = await look();
    expect(over.stat).toBe(1);
    expect(over.corner).toBeGreaterThan(before.corner);
    await page.mouse.move(1, 1);
    await page.waitForTimeout(700);
    expect(await look()).toEqual(before);

    // The keyboard gets what the mouse gets: Tab onto the tile flies the result out.
    await tile.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(700);
    expect(await tile.evaluate((t) => t === document.activeElement && t.matches(":focus-visible"))).toBe(true);
    expect((await look()).stat).toBe(1);

    // Every case has its result now; King’s Resort & Casino's flies out too.
    const kings = page.locator('.wall .tile[aria-label*="King’s"]');
    await kings.scrollIntoViewIfNeeded();
    await kings.hover({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(700);
    expect(await kings.evaluate((t) => t.querySelector(".plate-stat")!.textContent)).toBe("Live Content Production");
    expect(await kings.evaluate((t) => getComputedStyle(t.querySelector(".plate-stat")!).opacity)).toBe("1");
    expect(errors).toEqual([]);
    await context.close();
    await mouse.close();

    const touch = await open(browser, `${full.url}/?lang=ru`, phone);
    expect(await touch.page.evaluate(() => getComputedStyle(document.querySelectorAll(".wall .plate-stat")[0]).opacity)).toBe("1");
    await touch.context.close();
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

// The CEO's four, in order. ШАН / SHAN stays in capitals.
const CREW = {
  ru: [["Погорелов", "Арт-директор"], ["ШАН", "Продукт-менеджер"], ["Мария", "Хэд-дизайнер"], ["Джексон", "Бренд-менеджер"]],
  en: [["Pogorelov", "Art Director"], ["SHAN", "Product Manager"], ["Maria", "Head Designer"], ["Jackson", "Brand Manager"]],
};
const PHOTOS = [1, 2, 3, 4].map((n) => `/media/team-${n}.webp`);

const badges = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".wall .tag")].map((t) => [
      t.querySelector(".tag-nm > :not(.tag-ph)")!.textContent,
      t.querySelector(".tag-role")!.textContent,
    ]),
  );
// Scroll the page through once, so everything near the wall gets its turn to load.
const sweep = async (page: Page) => {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 500) {
    await page.evaluate((top) => scrollTo({ top, behavior: "instant" }), y);
    await page.waitForTimeout(120);
  }
};
// Scroll the page so that badge n (0 to 3, the CEO's order) sits at 40 % of the screen height.
const toBadge = (page: Page, n: number) =>
  page.evaluate((i) => {
    const r = document.querySelectorAll(".wall .tag")[i].getBoundingClientRect();
    scrollTo({ top: scrollY + r.top - innerHeight * 0.4, behavior: "instant" });
  }, n);
const MARIA = 2;
const video = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>(".wall .tag video")!;
    return { paused: v.paused, muted: v.muted, loop: v.loop, inline: v.playsInline, src: v.getAttribute("src"), ready: v.readyState, width: v.videoWidth };
  });
const waitPlaying = (page: Page) =>
  page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>(".wall .tag video")!;
    return !v.paused && v.readyState >= 2;
  }, null, { timeout: 10000 });

describe("team badges", () => {
  test("four badges with the right names and roles in Russian, then in English after the switch", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    expect(await badges(page)).toEqual(CREW.ru);
    await page.click('.nav-lang button[lang="en"]');
    expect(await badges(page)).toEqual(CREW.en);
    await page.click('.nav-lang button[lang="ru"]');
    expect(await badges(page)).toEqual(CREW.ru);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("every badge shows its whole role, from 320 to 1440 px, RU and EN (tablets in portrait too)", async () => {
    const context = await browser.newContext({ locale: "ru-RU" });
    const page = await context.newPage();
    const cut: string[] = [];
    for (const width of [320, 390, 701, 744, 768, 834, 870, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const lang of ["ru", "en"]) {
        await page.goto(`${full.url}/?lang=${lang}`, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        const over = await page.evaluate(() =>
          [...document.querySelectorAll(".wall .tag")].map((t) => t.querySelector(".tag-role")!.getBoundingClientRect().bottom - t.getBoundingClientRect().bottom),
        );
        // Capitals sit on the baseline: 2 px of the line box below the edge cut nothing.
        over.forEach((o, i) => o > 2 && cut.push(`${width} ${lang} badge ${i}: ${o.toFixed(1)} px`));
      }
    }
    expect(cut).toEqual([]);
    await context.close();
  });

  test("every team picture and Maria's loop answer and load; the badge pictures have an empty alt", async () => {
    for (const url of [...PHOTOS, "/media/team-3.mp4"]) expect((await fetch(`${full.url}${url}`)).status, url).toBe(200);
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    await sweep(page);
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".wall .tag-ph img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 });
    const imgs = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>(".wall .tag-ph img")].map((i) => ({ src: i.getAttribute("src"), alt: i.getAttribute("alt"), w: i.naturalWidth, shown: getComputedStyle(i).display !== "none", round: getComputedStyle(i.parentElement!).borderRadius })),
    );
    expect(imgs.map((i) => plain(i.src))).toEqual(PHOTOS);
    for (const i of imgs) {
      expect(i.alt).toBe("");
      expect(i.w).toBe(320);
      expect(i.shown).toBe(true);
      expect(i.round).toBe("50%");
    }
    expect(await page.locator(".wall .tag-ph.no-photo").count()).toBe(0);
    // Maria's loop loads and plays once her badge is on screen.
    await toBadge(page, MARIA);
    await waitPlaying(page);
    expect((await video(page)).width).toBe(320);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("photos load near the screen and not before 2 s: on a phone the last badge waits until it is near", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`, phone);
    await page.waitForTimeout(1000);
    const early = await page.evaluate(() => [...document.querySelectorAll(".wall .tag-ph img")].map((i) => i.getAttribute("src")));
    expect(early, "no badge photo within 1 s of load").toEqual([null, null, null, null]);
    await page.waitForTimeout(1800);
    const src = () => page.evaluate(() => [...document.querySelectorAll(".wall .tag-ph img")].map((i) => i.getAttribute("src")));
    const first = await src();
    expect(plain(first[0])).toBe(PHOTOS[0]);
    expect(first[3], "the last badge is far below the first screen").toBeNull();
    await toBadge(page, 3);
    await page.waitForFunction(() => document.querySelectorAll<HTMLImageElement>(".wall .tag-ph img")[3].naturalWidth > 0, null, { timeout: 5000 });
    expect(plain((await src())[3])).toBe(PHOTOS[3]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("the clients' sheet: ten logos in ink under «Наши клиенты», drawn only near the screen and after 2 s", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    expect(await page.textContent(".wall .brand-sheet h3")).toBe("Наши клиенты");
    const names = await page.$$eval(".wall .brand-sheet .logo-mark", (els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names).toEqual(["Mercedes-Benz", "Lavazza", "Burger King", "Danone", "Efes", "Skillbox", "Skyeng", "Skillfactory", "GeekBrains", "VK"]);
    expect(await page.$$eval(".wall .brand-sheet.on", (els) => els.length), "no logos within the first 2 s").toBe(0);
    await page.locator(".wall .brand-sheet").scrollIntoViewIfNeeded();
    await page.waitForSelector(".wall .brand-sheet.on", { timeout: 5000 });
    const marks = await page.$$eval(".wall .brand-sheet .logo-mark", (els) => els.map((e) => getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage));
    for (const m of marks) expect(m).toMatch(/url\(/);
    const ok = await page.evaluate(async () => {
      const urls = [...document.querySelectorAll<HTMLElement>(".wall .brand-sheet .logo-mark")].map((e) => e.style.getPropertyValue("--logo").slice(5, -2));
      return Promise.all(urls.map(async (u) => (await fetch(u)).ok));
    });
    expect(ok.every(Boolean)).toBe(true);
    // Every logo inside the sheet, and the sheet inside its cell, from the narrowest phone up.
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(150);
      const fit = await page.evaluate(() => {
        const s = document.querySelector<HTMLElement>(".wall .brand-sheet")!;
        const box = s.getBoundingClientRect(), cell = s.parentElement!.getBoundingClientRect();
        const marks = [...s.querySelectorAll(".logo-mark")].map((m) => m.getBoundingClientRect());
        return { inCell: box.height <= cell.height + 0.5, inSheet: marks.every((m) => m.top >= box.top && m.bottom <= box.bottom && m.right <= box.right + 0.5) };
      });
      expect(fit, `${width} px`).toEqual({ inCell: true, inSheet: true });
    }
    expect(errors).toEqual([]);
    await context.close();
  });

  test("Maria's loop is muted, inline and looped, plays on screen and stops off screen and when the pause button is on", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    expect(await page.locator(".wall .tag video").count()).toBe(1);
    expect(await page.locator(".wall .tag-ph video").getAttribute("aria-hidden")).toBe("true");
    await toBadge(page, MARIA);
    await waitPlaying(page);
    const v = await video(page);
    expect({ ...v, src: plain(v.src) }).toMatchObject({ paused: false, muted: true, loop: true, inline: true, src: "/media/team-3.mp4" });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".wall .tag video")!).opacity)).toBe("1");

    await page.click(".pause-btn");
    await page.waitForFunction(() => document.querySelector<HTMLVideoElement>(".wall .tag video")!.paused, null, { timeout: 3000 });
    await page.waitForTimeout(300);
    expect((await video(page)).paused).toBe(true);
    await page.click(".pause-btn");
    await waitPlaying(page);

    // Off screen: scroll to the end of the page, far from the badge.
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await page.waitForFunction(() => document.querySelector<HTMLVideoElement>(".wall .tag video")!.paused, null, { timeout: 3000 });
    await toBadge(page, MARIA);
    await waitPlaying(page);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("calm: Maria's loop is never loaded; her poster still shows", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const loops: string[] = [];
    page.on("request", (r) => r.url().includes("/media/team-3.mp4") && loops.push(r.url()));
    await page.goto(`${full.url}/?lang=ru`, { waitUntil: "load" });
    await sweep(page);
    await toBadge(page, MARIA);
    await page.waitForTimeout(3000);
    expect(loops).toEqual([]);
    expect(await video(page)).toMatchObject({ paused: true, src: null });
    const still = await page.evaluate(() => {
      const spot = document.querySelector(".wall .tag-ph:has(video)")!;
      const img = spot.querySelector("img")!;
      return { poster: img.getAttribute("src"), drawn: img.complete && img.naturalWidth > 0, videoHidden: getComputedStyle(spot.querySelector("video")!).opacity === "0" };
    });
    expect({ ...still, poster: plain(still.poster) }).toEqual({ poster: "/media/team-3.webp", drawn: true, videoHidden: true });
    await context.close();
  });

  test("a picture that does not load leaves the placeholder spot, not a broken image", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.route(/\/media\/team-1\.webp/, (route) => route.abort());
    await page.goto(`${full.url}/?lang=ru`, { waitUntil: "load" });
    await sweep(page);
    await page.waitForSelector(".wall .tag-ph.no-photo", { timeout: 5000 });
    expect(await page.locator(".wall .tag-ph.no-photo").count()).toBe(1);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".wall .tag-ph.no-photo")!).borderStyle)).toBe("dashed");
    await context.close();
  });

  for (const device of ["computer", "phone"] as const) {
    test(`${device}: a badge opens big over the page; a second click, the close button and Esc send it back`, async () => {
      const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`, device === "phone" ? phone : {});
      const press = (sel: string) => (device === "phone" ? page.tap(sel) : page.click(sel));
      await toBadge(page, 0);
      const small = await page.locator(".wall .tag").first().boundingBox();
      expect(await page.locator(".wall .tag").first().getAttribute("aria-label")).toBe("Познакомиться: Погорелов, Арт-директор");
      const opened = async () => {
        await page.waitForSelector("dialog.meet[open]");
        await page.waitForFunction(() => document.querySelector(".meet-card")!.getAnimations().every((a) => a.playState === "finished"));
        const big = (await page.locator(".meet-card .tag").boundingBox())!;
        expect(big.width).toBeGreaterThan(small!.width * 1.8);
        expect(await page.locator(".meet-card .tag-nm").textContent()).toBe("Погорелов");
        expect(await page.isVisible(".meet-x")).toBe(true);
        expect(await page.evaluate(() => getComputedStyle(document.querySelector(".wall .tag")!).visibility)).toBe("hidden");
      };
      const closed = async () => {
        await page.waitForSelector("dialog.meet:not([open])", { state: "attached", timeout: 3000 });
        expect(await page.evaluate(() => getComputedStyle(document.querySelector(".wall .tag")!).visibility)).toBe("visible");
      };
      await press(".wall .tag >> nth=0");
      await opened();
      expect(await page.evaluate(() => document.activeElement?.className)).toBe("meet-x");
      await press(".meet-card .tag");
      await closed();
      expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Познакомиться: Погорелов, Арт-директор");
      await press(".wall .tag >> nth=0");
      await opened();
      expect(await page.textContent(".meet-x")).toBe("Закрыть");
      await press(".meet-x");
      await closed();
      await page.focus(".wall .tag >> nth=0");
      await page.keyboard.press("Enter");
      await opened();
      await page.keyboard.press("Escape");
      await closed();
      expect(errors).toEqual([]);
      await context.close();
    });
  }

  test("English: the badge and its close button speak English", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=en`);
    await toBadge(page, 1);
    expect(await page.locator(".wall .tag").nth(1).getAttribute("aria-label")).toBe("Meet SHAN, Product Manager");
    await page.click(".wall .tag >> nth=1");
    await page.waitForSelector("dialog.meet[open]");
    expect(await page.textContent(".meet-x")).toBe("Close");
    expect(await page.getAttribute("dialog.meet", "aria-label")).toBe("SHAN, Product Manager");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("calm: the badge opens and closes at once, without flying", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`, { reducedMotion: "reduce" });
    await toBadge(page, 0);
    await page.click(".wall .tag >> nth=0");
    await page.waitForSelector("dialog.meet[open]");
    expect(await page.evaluate(() => document.querySelector(".meet-card")!.getAnimations().length)).toBe(0);
    await page.click(".meet-x");
    expect(await page.evaluate(() => !!document.querySelector("dialog.meet[open]"))).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a click outside the open badge sends it back, and focus returns to the badge", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    await toBadge(page, 0);
    await page.click(".wall .tag >> nth=0");
    await page.waitForSelector("dialog.meet[open]");
    await page.waitForFunction(() => document.querySelector(".meet-card")!.getAnimations().every((a) => a.playState === "finished"));
    await page.mouse.click(20, 20);
    await page.waitForSelector("dialog.meet:not([open])", { state: "attached", timeout: 3000 });
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Познакомиться: Погорелов, Арт-директор");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a click next to the open card, still inside its box, sends it back", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    await toBadge(page, 0);
    await page.click(".wall .tag >> nth=0");
    await page.waitForSelector("dialog.meet[open]");
    await page.waitForFunction(() => document.querySelector(".meet-card")!.getAnimations().every((a) => a.playState === "finished"));
    const box = (await page.locator(".meet-box").boundingBox())!;
    const card = (await page.locator(".meet-card").boundingBox())!;
    expect(card.x - box.x).toBeGreaterThan(8);
    await page.mouse.click(box.x + (card.x - box.x) / 2, box.y + box.height / 2);
    await page.waitForSelector("dialog.meet:not([open])", { state: "attached", timeout: 3000 });
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a double click leaves the badge open; Esc in flight turns it back from where it is; two quick Esc leave the wall whole", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    const closed = async () => {
      await page.waitForSelector("dialog.meet:not([open])", { state: "attached", timeout: 3000 });
      await page.waitForTimeout(700);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".wall .tag")!).visibility)).toBe("visible");
      expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Познакомиться: Погорелов, Арт-директор");
    };
    await toBadge(page, 0);
    await page.dblclick(".wall .tag >> nth=0");
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => !!document.querySelector("dialog.meet[open]"))).toBe(true);
    await page.keyboard.press("Escape");
    await closed();

    // Held 200 ms into the flight, then Esc: the way back starts at that size, not at the full one.
    await page.click(".wall .tag >> nth=0");
    await page.waitForSelector("dialog.meet[open]");
    await page.evaluate(() => {
      const a = document.querySelector(".meet-card")!.getAnimations()[0];
      a.pause();
      a.currentTime = 200;
    });
    await page.keyboard.press("Escape");
    const scale = await page.evaluate(() => {
      const from = String((document.querySelector(".meet-card")!.getAnimations()[0].effect as KeyframeEffect).getKeyframes()[0].transform);
      const [a, b] = from.match(/-?[\d.e-]+/g)!.map(Number);
      return Math.hypot(a, b);
    });
    expect(scale).toBeLessThan(0.95);
    await closed();

    await page.click(".wall .tag >> nth=0");
    await page.waitForFunction(() => document.querySelector(".meet-card")!.getAnimations().every((a) => a.playState === "finished"));
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await closed();
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a lifted tile drops its corner clip, so its drag shadow is whole", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    const tile = page.locator(".wall .tile").nth(2);
    await tile.scrollIntoViewIfNeeded();
    const b = (await tile.boundingBox())!;
    expect(await tile.evaluate((t) => getComputedStyle(t).clipPath)).not.toBe("none");
    await page.mouse.move(b.x + 100, b.y + 100);
    await page.mouse.down();
    await page.mouse.move(b.x + 130, b.y + 110, { steps: 5 });
    await page.mouse.move(b.x + 160, b.y + 120, { steps: 5 });
    expect(await tile.evaluate((t) => [t.classList.contains("lifted"), getComputedStyle(t).clipPath])).toEqual([true, "none"]);
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(await tile.evaluate((t) => getComputedStyle(t).clipPath)).not.toBe("none");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("dragging a badge moves it and does not open it", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    await toBadge(page, 0);
    const b = (await page.locator(".wall .tag").first().boundingBox())!;
    const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y + 10, { steps: 5 });
    await page.mouse.move(x + 60, y + 20, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => !!document.querySelector("dialog.meet[open]"))).toBe(false);
    expect((await page.locator(".wall .tag").first().boundingBox())!.x - b.x).toBeGreaterThan(30);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("Maria's open badge plays her video; with the pause on and in calm it stays still and shows her photo", async () => {
    const clip = (page: Page) =>
      page.evaluate(() => {
        const v = document.querySelector<HTMLVideoElement>(".meet-card video")!;
        return { paused: v.paused, src: v.getAttribute("src"), shown: v.parentElement!.classList.contains("shown") };
      });
    const openMaria = async (page: Page) => {
      await toBadge(page, MARIA);
      await page.click(`.wall .tag >> nth=${MARIA}`);
      await page.waitForSelector("dialog.meet[open]");
    };
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    await openMaria(page);
    await page.waitForFunction(() => {
      const v = document.querySelector<HTMLVideoElement>(".meet-card video");
      return !!v && !v.paused && v.parentElement!.classList.contains("shown");
    }, null, { timeout: 10000 });
    expect(plain((await clip(page)).src)).toBe("/media/team-3.mp4");
    await page.keyboard.press("Escape");
    await page.waitForSelector("dialog.meet:not([open])", { state: "attached", timeout: 3000 });
    await page.click(".pause-btn");
    await openMaria(page);
    await page.waitForTimeout(500);
    expect(await clip(page)).toEqual({ paused: true, src: null, shown: false });
    expect(errors).toEqual([]);
    await context.close();

    const calm = await open(browser, `${full.url}/?lang=ru`, { reducedMotion: "reduce" });
    await openMaria(calm.page);
    await calm.page.waitForTimeout(500);
    expect(await clip(calm.page)).toEqual({ paused: true, src: null, shown: false });
    expect(calm.errors).toEqual([]);
    await calm.context.close();
  });

  test("roll call: the team block and all four badges move to the top of the wall and each badge hops", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    await page.click("#team .team-block");
    await page.waitForSelector(".wall.rollcall", { timeout: 10000 });
    const order = await page.evaluate(() => [...document.querySelectorAll(".wall > .cell")].slice(0, 5).map((c) => (c.id === "team" ? "team" : c.classList.contains("tag-cell") ? "tag" : "other")));
    expect(order).toEqual(["team", "tag", "tag", "tag", "tag"]);
    // Each badge hops once: a scripted animation (not a transition) runs on its piece.
    const hopped = await page.evaluate(
      () =>
        new Promise<number>((done) => {
          const seen = new Set<Element>();
          const pieces = [...document.querySelectorAll(".wall .tag-cell > .tag")];
          const t0 = performance.now();
          const tick = () => {
            for (const p of pieces) if (p.getAnimations().some((a) => !(a instanceof CSSTransition))) seen.add(p);
            if (seen.size === pieces.length || performance.now() - t0 > 2500) done(seen.size);
            else requestAnimationFrame(tick);
          };
          tick();
        }),
    );
    expect(hopped).toBe(4);
    // The wall is back to normal after a moment.
    await page.waitForFunction(() => !document.querySelector(".wall.rollcall"), null, { timeout: 6000 });
    expect(errors).toEqual([]);
    await context.close();
  });
});
