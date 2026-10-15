// Wall: dense packing without holes, no sideways scroll, the first tile in view,
// lazy loops (nothing before 2 s, only near the screen, at most 3 loading), posters that stay
// when a loop fails, the four team badges (names, roles, photos, Maria's loop, roll call), no console errors.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "playwright-core";
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
      const m = /\/media\/c(\d)-(tile|phone)\.mp4/.exec(r.url());
      if (m) {
        loops.push({ id: Number(m[1]), at: Date.now() });
        seq.push(`loop:${m[1]}`);
      }
      const p = /\/media\/c(\d)(-phone)?\.webp/.exec(r.url());
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

  test("every loop request aborted: posters stay, no video keeps a source, no loop is asked again within 5 s", async () => {
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
    await page.route("**/media/*-tile.mp4", (route) => {
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

    const state = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".wall .tile")].map((t) => {
          const img = t.querySelector<HTMLImageElement>(".tile-poster")!;
          const video = t.querySelector<HTMLVideoElement>("video")!;
          return {
            label: t.getAttribute("aria-label")!.slice(0, 8),
            hasPoster: img.hasAttribute("src"),
            posterDrawn: img.complete && img.naturalWidth > 0 && getComputedStyle(img).visibility === "visible" && !t.classList.contains("no-poster"),
            videoShown: t.classList.contains("shown") || getComputedStyle(video).opacity !== "0",
            videoSrc: video.getAttribute("src"),
          };
        }),
      );
    const check = (tiles: Awaited<ReturnType<typeof state>>, when: string) => {
      expect(tiles.filter((t) => t.hasPoster).length, `tiles with a poster ${when}`).toBeGreaterThanOrEqual(sure);
      for (const t of tiles) {
        expect(t.videoSrc, `source of ${t.label} ${when}`).toBeNull();
        expect(t.videoShown, `video of ${t.label} shown ${when}`).toBe(false);
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

// The CEO's four, in order. ШАН / SHAN stays in capitals.
const CREW = {
  ru: [["Погорелов", "Арт-директор"], ["ШАН", "Проджект-менеджер"], ["Мария", "Хэд-дизайнер"], ["Джексон", "Бренд-менеджер"]],
  en: [["Pogorelov", "Art Director"], ["SHAN", "Project Manager"], ["Maria", "Head Designer"], ["Jackson", "Brand Manager"]],
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

  test("every team picture and Maria's loop answer and load; the badge pictures have an empty alt", async () => {
    for (const url of [...PHOTOS, "/media/team-3.mp4"]) expect((await fetch(`${full.url}${url}`)).status, url).toBe(200);
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    await sweep(page);
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".wall .tag-ph img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 });
    const imgs = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>(".wall .tag-ph img")].map((i) => ({ src: i.getAttribute("src"), alt: i.getAttribute("alt"), w: i.naturalWidth, shown: getComputedStyle(i).display !== "none", round: getComputedStyle(i.parentElement!).borderRadius })),
    );
    expect(imgs.map((i) => i.src)).toEqual(PHOTOS);
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
    expect(first[0]).toBe(PHOTOS[0]);
    expect(first[3], "the last badge is far below the first screen").toBeNull();
    await toBadge(page, 3);
    await page.waitForFunction(() => document.querySelectorAll<HTMLImageElement>(".wall .tag-ph img")[3].naturalWidth > 0, null, { timeout: 5000 });
    expect((await src())[3]).toBe(PHOTOS[3]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("Maria's loop is muted, inline and looped, plays on screen and stops off screen and when the pause button is on", async () => {
    const { context, page, errors } = await open(browser, `${full.url}/?lang=ru`);
    expect(await page.locator(".wall .tag video").count()).toBe(1);
    expect(await page.locator(".wall .tag-ph video").getAttribute("aria-hidden")).toBe("true");
    await toBadge(page, MARIA);
    await waitPlaying(page);
    expect(await video(page)).toMatchObject({ paused: false, muted: true, loop: true, inline: true, src: "/media/team-3.mp4" });
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
    page.on("request", (r) => r.url().endsWith("/media/team-3.mp4") && loops.push(r.url()));
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
    expect(still).toEqual({ poster: "/media/team-3.webp", drawn: true, videoHidden: true });
    await context.close();
  });

  test("a picture that does not load leaves the placeholder spot, not a broken image", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.route("**/media/team-1.webp", (route) => route.abort());
    await page.goto(`${full.url}/?lang=ru`, { waitUntil: "load" });
    await sweep(page);
    await page.waitForSelector(".wall .tag-ph.no-photo", { timeout: 5000 });
    expect(await page.locator(".wall .tag-ph.no-photo").count()).toBe(1);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".wall .tag-ph.no-photo")!).borderStyle)).toBe("dashed");
    await context.close();
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
