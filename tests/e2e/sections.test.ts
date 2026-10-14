// Manifesto, contacts and footer: marks draw in on scroll, the slogan fits the width, English.
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser, Page } from "playwright-core";
import { launch, open, startServer } from "./helpers.ts";

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

const marks = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>("#manifesto mark")].map((m) => ({ pre: m.classList.contains("pre"), size: getComputedStyle(m).backgroundSize })));

test("manifesto marks wait below the fold and draw in when scrolled to", async () => {
  const { context, page, errors } = await open(browser, server.url);
  const before = await marks(page);
  expect(before).toHaveLength(3);
  expect(before.every((m) => m.pre && m.size.startsWith("0%"))).toBe(true);
  await page.evaluate(() => document.querySelector("#manifesto")!.scrollIntoView({ behavior: "instant" }));
  await page.waitForFunction(() => document.querySelectorAll("#manifesto mark.pre").length === 0, undefined, { timeout: 3000 });
  await page.waitForTimeout(1300);
  expect((await marks(page)).map((m) => m.size)).toEqual(Array(3).fill("100% 45%"));
  // The three colours: lemon, pink (b), mint (m).
  expect(await page.evaluate(() => [...document.querySelectorAll("#manifesto mark")].map((m) => m.className))).toEqual(["", "b", "m"]);
  expect(errors).toEqual([]);
  await context.close();
});

test("calm: marks are drawn from the start", async () => {
  const { context, page } = await open(browser, server.url, { reducedMotion: "reduce" });
  expect((await marks(page)).every((m) => !m.pre)).toBe(true);
  await context.close();
});

test("footer slogan letters fit the width without horizontal scroll at 320 and 1440, and refit on resize", async () => {
  const { context, page, errors } = await open(browser, server.url, { viewport: { width: 1440, height: 900 } });
  const fit = () =>
    page.evaluate(() => {
      const word = document.querySelector<HTMLElement>(".foot-word")!;
      const line = word.querySelector<HTMLElement>(".foot-line")!;
      return {
        share: line.getBoundingClientRect().width / word.clientWidth,
        overflow: document.documentElement.scrollWidth - innerWidth,
        letters: word.querySelectorAll(".fl[data-piece]").length,
      };
    });
  const wide = await fit();
  expect(wide.letters).toBe(11);
  expect(wide.overflow).toBe(0);
  expect(wide.share).toBeGreaterThan(0.97);
  expect(wide.share).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.waitForTimeout(300);
  const narrow = await fit();
  expect(narrow.overflow).toBe(0);
  expect(narrow.share).toBeGreaterThan(0.97);
  expect(narrow.share).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  await context.close();

  // A fresh page at 320 fits too.
  const small = await open(browser, server.url, { viewport: { width: 320, height: 700 } });
  expect(await small.page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  expect(await small.page.evaluate(() => document.querySelector(".foot-line")!.getBoundingClientRect().width <= document.querySelector<HTMLElement>(".foot-word")!.clientWidth)).toBe(true);
  await small.context.close();
});

const texts = (page: Page) =>
  page.evaluate(() => ({
    kicker: document.querySelector(".mani-pill")?.textContent,
    mani: document.querySelector("#mani-h")?.textContent,
    mark: document.querySelector("#manifesto mark")?.textContent,
    say: document.querySelector("#contacts-h")?.textContent,
    copy: document.querySelector(".contact-copy")?.textContent,
    slogan: document.querySelector(".foot-word")?.getAttribute("aria-label"),
    letters: [...document.querySelectorAll(".foot-word .fl")].map((l) => l.textContent).join(""),
    footNav: [...document.querySelectorAll(".foot-nav a")].map((a) => a.textContent),
    dive: document.querySelector(".dive-btn")?.getAttribute("aria-label"),
    tidy: document.querySelector(".tidy-t")?.textContent,
    hint: document.querySelector(".drag-hint")?.textContent,
  }));

const EN = {
  kicker: "Manifesto",
  mani: "How we work",
  mark: "Design grows out of meaning,",
  say: "Say hello",
  copy: "Copy email",
  slogan: "Dive deeper",
  letters: "Divedeeper",
  footNav: ["Cases", "Services", "Manifesto", "Team", "Contact"],
  dive: "Random case",
  tidy: "Tidy up",
  hint: "Drag anything. The whale doesn’t mind.",
};

test("English texts with ?lang=en", async () => {
  const { context, page, errors } = await open(browser, `${server.url}/?lang=en`);
  expect(await texts(page)).toEqual(EN);
  expect(errors).toEqual([]);
  await context.close();
});

test("switching the language rebuilds headline words and slogan letters as pieces", async () => {
  const { context, page, errors } = await open(browser, server.url);
  expect((await texts(page)).say).toBe("Напишите нам");
  await page.click('.nav-lang button[lang="en"]');
  await page.waitForTimeout(200);
  expect(await texts(page)).toEqual(EN);
  const pieces = await page.evaluate(() => ({
    words: [...document.querySelectorAll("#mani-h .w, #contacts-h .w")].every((w) => w.hasAttribute("data-piece")),
    letters: [...document.querySelectorAll(".foot-word .fl")].every((l) => l.hasAttribute("data-piece")),
  }));
  expect(pieces).toEqual({ words: true, letters: true });
  expect(errors).toEqual([]);
  await context.close();
});
