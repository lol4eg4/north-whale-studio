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

// The owner's free-concept offer is on the first screen, so the wall starts lower than it did:
// 21 % of the first tile shows at 1440x900 (RU), and on a 390x844 phone its top edge is just above the fold.
test("the first case tile shows without scrolling: 15 % at 1440x900, its top edge on a 390x844 phone", async () => {
  const desk = await open(browser, server.url);
  expect(await firstTileShown(desk.page)).toBeGreaterThanOrEqual(0.15);
  await desk.context.close();
  const ph = await open(browser, server.url, phone);
  expect(await firstTileShown(ph.page)).toBeGreaterThan(0);
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

test("a browser in English with no ?lang opens in Russian; a click on EN switches, and a reload keeps it", async () => {
  const { context, page, errors } = await open(browser, server.url, { locale: "en-US" });
  expect(await page.evaluate(() => navigator.language)).toBe("en-US");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("ru");
  expect(await page.locator(".nav .lang button[lang=ru]").getAttribute("aria-pressed")).toBe("true");
  await page.locator(".nav .lang button[lang=en]").click();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  await page.reload({ waitUntil: "load" });
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  // The address wins over the remembered choice.
  await page.goto(`${server.url}/?lang=ru`);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("ru");
  expect(errors).toEqual([]);
  await context.close();
});

test("only the click on the switch is remembered, under nws.language; the old nws.lang and Back to a ?lang are not", async () => {
  const { context, page, errors } = await open(browser, server.url, { locale: "en-US" });
  await page.evaluate(() => localStorage.setItem("nws.lang", "en"));
  await page.reload({ waitUntil: "load" });
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("ru");
  expect(await page.evaluate(() => localStorage.getItem("nws.language"))).toBeNull();
  await page.locator(".nav .lang button[lang=en]").click();
  expect(await page.evaluate(() => localStorage.getItem("nws.language"))).toBe("en");
  // Back to an address with ?lang=ru: the page follows it, the choice stays the click's.
  await page.evaluate(() => {
    history.pushState(null, "", "?lang=ru");
    history.pushState(null, "", "?lang=en");
    history.back();
  });
  await page.waitForFunction(() => document.documentElement.lang === "ru");
  expect(await page.evaluate(() => localStorage.getItem("nws.language"))).toBe("en");
  expect(errors).toEqual([]);
  await context.close();
});

test("phone: the switch stands in the kicker row on the first screen, thumb-sized; the menu names the languages; all switches agree", async () => {
  const { context, page, errors } = await open(browser, server.url, phone);
  const hero = page.locator(".hero .kicker .hero-lang");
  expect(await page.locator(".nav .nav-lang").isVisible()).toBe(false);
  expect(await hero.isVisible()).toBe(true);
  const box = (await hero.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  for (const b of await hero.locator("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await hero.locator("button[lang=en]").click();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  await page.locator(".nav .plus").click();
  expect(await page.locator(".menu-lang > .mono").textContent()).toBe("Site language");
  expect(await page.locator(".menu-lang .lang-named button").allTextContents()).toEqual(["Русский", "English"]);
  // Every switch on the page shows the same pressed language.
  const pressed = () => page.$$eval(".lang", (els) => els.map((g) => g.querySelector('[aria-pressed="true"]')!.getAttribute("lang")));
  expect(await pressed()).toEqual(["en", "en", "en"]);
  await page.locator(".menu-lang button[lang=ru]").click();
  expect(await pressed()).toEqual(["ru", "ru", "ru"]);
  expect(await page.evaluate(() => localStorage.getItem("nws.language"))).toBe("ru");
  expect(errors).toEqual([]);
  await context.close();
});

test("the hero offer is one link to the Telegram bot in a new tab, in view on the first screen at 1440x900 and 390x844", async () => {
  const BOT = "https://t.me/North_Whale_Studio_Bot";
  for (const lang of ["ru", "en"]) {
    for (const [name, options] of [["1440x900", {}], ["390x844", phone]] as const) {
      const { context, page, errors } = await open(browser, `${server.url}/?lang=${lang}`, options);
      const r = await page.evaluate(() => {
        const a = document.querySelector<HTMLAnchorElement>(".hero a.offer")!;
        const b = a.getBoundingClientRect();
        return {
          href: a.href,
          target: a.target,
          rel: a.rel,
          title: a.querySelector(".offer-t")!.textContent,
          cta: a.querySelector(".offer-cta")!.textContent,
          label: a.getAttribute("aria-label")!,
          // Tab meets the card before the buttons, as the phone shows it.
          beforeButtons: !!(a.compareDocumentPosition(document.querySelector(".hero .watch")!) & Node.DOCUMENT_POSITION_FOLLOWING),
          // The whole card is the link: nothing inside it is another link or button.
          inner: a.querySelectorAll("a, button").length,
          inView: b.width > 0 && b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth,
        };
      });
      expect(r.href, `${lang} ${name}`).toBe(BOT);
      expect([r.target, r.rel], `${lang} ${name}`).toEqual(["_blank", "noopener"]);
      expect([r.title, r.cta], `${lang} ${name}`).toEqual(
        lang === "ru" ? ["Бесплатный концепт вашего сайта", "Получить концепт"] : ["A free concept for your website", "Get the concept"],
      );
      expect(r.inner, `${lang} ${name}: links inside the card`).toBe(0);
      expect(r.beforeButtons, `${lang} ${name}: tab order`).toBe(true);
      // Its name holds the words on it, so a voice command with the button's words finds it.
      expect(r.label.startsWith(`${r.title}. ${r.cta}:`), `${lang} ${name}: ${r.label}`).toBe(true);
      expect(r.inView, `${lang} ${name}: on the first screen`).toBe(true);
      // Its focus ring sits on the white page, outside the card: cobalt, as everywhere on paper.
      await page.keyboard.press("Tab");
      await page.locator(".hero a.offer").focus();
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".hero a.offer:focus-visible")!).outlineColor)).toBe("rgb(47, 75, 255)");
      expect(errors).toEqual([]);
      await context.close();
    }
  }
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
    const hits = [...document.querySelectorAll(".hero .kicker span, .hero .hero-lang, .hero .hw, .hero .peel-slot, .hero .hero-note, .hero .lede, .hero .watch, .hero .believe, .hero .offer")]
      .filter((e) => {
        const o = e.getBoundingClientRect();
        return o.width > 0 && o.left < f.right && o.right > f.left && o.top < f.bottom && o.bottom > f.top;
      })
      .map((e) => e.textContent);
    const sides = f.left >= 12 && f.right <= innerWidth - 12;
    return { hits, inView: f.top >= 0 && f.bottom <= innerHeight && sides, sides, flow: a.classList.contains("flow"), at: [Math.round(f.left), Math.round(f.top)] };
  });

test("the Forbes 30 Under 30 clipping: on the first screen at every width, clear of the headline, the note and the buttons; links to the article in a new tab", async () => {
  const ARTICLE = "https://forbes.pe/brand-voice/2025-03-12/los-proximos-crypto-revolucionarios-30-under-30-by-kol-capital/";
  // Phones (two of them small), tablets, laptops (two of them short), wide screens.
  const views = [[320, 568], [320, 844], [360, 844], [375, 667], [390, 844], [768, 900], [1024, 900], [1280, 720], [1280, 900], [1366, 768], [1440, 900], [1920, 1080]];
  // 320x568 and 375x667 are too short for the hero with the owner's offer card: the clipping lands
  // below the first screen (bottom at 751-790 px of 568 at 320 px; at 375 px, 704 of 667 in Russian).
  // There it must still cover nothing and stay inside the side margins.
  const tooShort = new Set(["320x568", "375x667"]);
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
      if (tooShort.has(`${width}x${height}`)) expect(spot.sides, `${lang} ${width}x${height}: inside the side margins`).toBe(true);
      else expect(spot.inView, `${lang} ${width}x${height}: on the first screen`).toBe(true);
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
