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

test("the served page carries the bug widget loader; the export leaves it out", async () => {
  const html = await (await fetch(server.url)).text();
  if (process.env.E2E_EXPORT) expect(html).not.toContain("widget.js");
  else expect(html).toContain("widget.js");
});

// The Forbes clipping: what it covers among the hero's words, the note and the buttons, and
// whether it is whole on the first screen, inside the page's side margins (12 px at least).
const forbesSpot = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector(".hero a.forbes")!;
    const f = a.getBoundingClientRect();
    const hits = [...document.querySelectorAll(".hero .kicker span, .hero .hw, .hero .peel-slot, .hero .hero-note, .hero .lede, .hero .watch, .hero .believe")]
      .filter((e) => {
        const o = e.getBoundingClientRect();
        return o.width > 0 && o.left < f.right && o.right > f.left && o.top < f.bottom && o.bottom > f.top;
      })
      .map((e) => e.textContent);
    return { hits, inView: f.top >= 0 && f.bottom <= innerHeight && f.left >= 12 && f.right <= innerWidth - 12, flow: a.classList.contains("flow"), at: [Math.round(f.left), Math.round(f.top)] };
  });

test("the Forbes 30 Under 30 clipping: on the first screen at every width, clear of the headline, the note and the buttons; links to the article in a new tab", async () => {
  const ARTICLE = "https://forbes.pe/brand-voice/2025-03-12/los-proximos-crypto-revolucionarios-30-under-30-by-kol-capital/";
  // Phones (two of them small), tablets, laptops (two of them short), wide screens.
  const views = [[320, 568], [320, 844], [360, 844], [375, 667], [390, 844], [768, 900], [1024, 900], [1280, 720], [1280, 900], [1366, 768], [1440, 900], [1920, 1080]];
  for (const lang of ["ru", "en"])
    for (const [width, height] of views) {
      const options = width <= 700 ? { ...phone, viewport: { width, height } } : { viewport: { width, height } };
      const { context, page, errors } = await open(browser, `${server.url}/?lang=${lang}`, options);
      const r = await page.evaluate(() => {
        const a = document.querySelector<HTMLAnchorElement>(".hero a.forbes")!;
        return { href: a.href, target: a.target, rel: a.rel, label: a.getAttribute("aria-label"), logo: a.querySelector(".logo-mark")?.getAttribute("aria-label"), big: a.querySelector(".forbes-big")!.textContent };
      });
      expect(r.href).toBe(ARTICLE);
      expect([r.target, r.rel]).toEqual(["_blank", "noopener"]);
      expect(r.label).toContain("Forbes 30 Under 30");
      expect([r.logo, r.big]).toEqual(["Forbes", "30 Under 30"]);
      const spot = await forbesSpot(page);
      expect(spot.hits, `${lang} ${width}x${height}: covers`).toEqual([]);
      expect(spot.inView, `${lang} ${width}x${height}: on the first screen`).toBe(true);
      expect(errors).toEqual([]);
      await context.close();
    }
});

test("the Forbes clipping finds a new spot after a language switch and a resize, and keeps the keyboard focus", async () => {
  const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  // 1440 px: the English headline wraps otherwise, so the spot moves to where a fresh English page has it.
  {
    const desktop = { viewport: { width: 1440, height: 900 } };
    const fresh = await open(browser, `${server.url}/?lang=en`, desktop);
    const want = await forbesSpot(fresh.page);
    await fresh.context.close();
    const { context, page, errors } = await open(browser, `${server.url}/?lang=ru`, desktop);
    const before = await forbesSpot(page);
    await page.locator(".nav .lang button[lang=en]").click();
    await page.waitForFunction(() => document.documentElement.lang === "en");
    await frames(page);
    const after = await forbesSpot(page);
    expect(after).toEqual(want);
    expect(after.at).not.toEqual(before.at);
    expect(after.hits).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  }
  // Phones: at 360 and 430 px it stands beside the buttons, at 390 px beside the headline.
  const { context, page, errors } = await open(browser, `${server.url}/?lang=ru`, { ...phone, viewport: { width: 360, height: 844 } });
  await page.focus(".hero a.forbes");
  const flow: boolean[] = [];
  for (const width of [390, 430, 1280, 360]) {
    await page.setViewportSize({ width, height: width > 700 ? 900 : 844 });
    await frames(page);
    const spot = await forbesSpot(page);
    expect([spot.hits, spot.inView], `${width}`).toEqual([[], true]);
    expect(await page.evaluate(() => document.activeElement?.classList.contains("forbes")), `${width}: focus`).toBe(true);
    flow.push(spot.flow);
  }
  // It really moved between the buttons and the headline.
  expect(new Set(flow)).toEqual(new Set([true, false]));
  expect(errors).toEqual([]);
  await context.close();
});
