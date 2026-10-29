// Open case: dialog, closing paths, focus return, Next, deep links and history, language in the
// address, the player (plays on open, sound, error + retry) and the copy link fallback.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { launch, open, phone, plain, startServer } from "./helpers.ts";

let srv: { url: string; stop(): void };
let browser: Browser;

beforeAll(async () => {
  [srv, browser] = await Promise.all([startServer("app.json"), launch()]);
});
afterAll(async () => {
  await browser?.close();
  srv?.stop();
});

// A tile says its case's place in the list, not its id.
const ORDER = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11];
const tileSel = (id: number) => `.wall .tile[aria-label^="Кейс ${ORDER.indexOf(id) + 1}."]`;
const isOpen = (page: Page) => page.evaluate(() => document.querySelector<HTMLDialogElement>("dialog.case")!.open);
const waitClosed = (page: Page) => page.waitForFunction(() => !document.querySelector<HTMLDialogElement>("dialog.case")!.open);
const focusIs = (page: Page, sel: string) => page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
const title = (page: Page) => page.textContent("#case-title");
const hash = (page: Page) => page.evaluate(() => location.hash);

async function openTile(page: Page, id: number) {
  await page.click(tileSel(id));
  await page.waitForSelector("dialog.case[open]");
}

describe("open and close", () => {
  test("a tile opens the case; Esc closes it and focus returns to the tile", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    await openTile(page, 2);
    expect(await title(page)).toBe("AG1");
    expect(await hash(page)).toBe("#case-2");
    expect(await page.textContent(".case-count")).toBe("Кейс 02 из 10");
    expect(await focusIs(page, "dialog.case .case-x")).toBe(true);
    await page.keyboard.press("Escape");
    await waitClosed(page);
    expect(await hash(page)).toBe("");
    expect(await focusIs(page, tileSel(2))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("the close button closes it; a second Esc while closing does not leave the site", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    await openTile(page, 1);
    await page.click("dialog.case .case-x");
    await waitClosed(page);
    expect(await focusIs(page, tileSel(1))).toBe(true);

    await openTile(page, 1);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await waitClosed(page);
    await page.waitForTimeout(300);
    expect(page.url()).toBe(`${srv.url}/?lang=ru`);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("browser Back closes the case and returns to its tile", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    await openTile(page, 4);
    await page.evaluate(() => history.back());
    await waitClosed(page);
    expect(page.url()).toBe(`${srv.url}/?lang=ru`);
    expect(await focusIs(page, tileSel(4))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("Next names the next case and opens it without a new history entry; on the last case it leads back to the wall", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    const before = await page.evaluate(() => history.length);
    await openTile(page, 10);
    expect(await title(page)).toBe("Axie Infinity");
    expect(await page.textContent("dialog.case .case-next")).toBe("Дальше: Tria");
    await page.click("dialog.case .case-next");
    await page.waitForFunction(() => document.querySelector("#case-title")!.textContent === "Tria");
    expect(await hash(page)).toBe("#case-11");
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    expect(await page.textContent("dialog.case .case-next")).toBe("Назад к стене");
    await page.click("dialog.case .case-next");
    await waitClosed(page);
    expect(await hash(page)).toBe("");
    expect(await focusIs(page, tileSel(11))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("«Написать нам» closes the case and goes to contacts", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    await openTile(page, 1);
    await page.click("dialog.case .case-talk");
    await waitClosed(page);
    await page.waitForFunction(() => location.hash === "#contacts");
    expect(errors).toEqual([]);
    await context.close();
  });

  // Regression: ISSUE-001 — «Написать нам» set #contacts but the page stayed where it was:
  // the browser restored the scroll after Back. Found by QA on 2026-10-15.
  for (const [how, url] of [["a tile", "/?lang=ru"], ["a link", "/?lang=ru#case-4"]] as const) {
    test(`«Написать нам» in a case opened from ${how} brings the contacts into view`, async () => {
      const { context, page, errors } = await open(browser, `${srv.url}${url}`);
      if (how === "a tile") await openTile(page, 4);
      else await page.waitForSelector("dialog.case[open]");
      await page.click("dialog.case .case-talk");
      await waitClosed(page);
      await page.waitForFunction(() => {
        const r = document.querySelector("#contacts")!.getBoundingClientRect();
        return r.top >= 0 && r.top < innerHeight / 2;
      }, null, { timeout: 5000 });
      expect(errors).toEqual([]);
      await context.close();
    });
  }

  test("a press inside the panel released on the outer margin keeps the case open; a plain click there closes it", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    await openTile(page, 2);
    // The panel reveal clips and moves the content; wait until it has settled.
    await page.waitForFunction(() => document.querySelector("dialog.case")!.getAnimations({ subtree: true }).length === 0, null, { timeout: 8000 });
    const margin = { x: 10, y: 10 };
    // The margin is the dialog's own padding around the panel.
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y) === document.querySelector("dialog.case"), margin)).toBe(true);
    const box = (await page.locator("dialog.case .case-title").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(margin.x, margin.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(await isOpen(page)).toBe(true);
    expect(await hash(page)).toBe("#case-2");

    await page.mouse.click(margin.x, margin.y);
    await waitClosed(page);
    expect(await hash(page)).toBe("");
    expect(errors).toEqual([]);
    await context.close();
  });
});

describe("links and history", () => {
  test("/#case-3 opens case 3 on load; Back leaves the case but stays on the site", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru#case-3`);
    await page.waitForSelector("dialog.case[open]");
    expect(await title(page)).toBe("Dear Passengers");
    await page.evaluate(() => history.back());
    await waitClosed(page);
    expect(page.url()).toBe(`${srv.url}/?lang=ru`);
    expect(await page.evaluate(() => !!document.querySelector(".wall"))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("/#case-42 shows the wall", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru#case-42`);
    await page.waitForTimeout(300);
    expect(await isOpen(page)).toBe(false);
    expect(await hash(page)).toBe("#cases");
    await page.waitForFunction(() => Math.abs(document.querySelector("#cases")!.getBoundingClientRect().top) < 120, null, { timeout: 5000 });
    expect(errors).toEqual([]);
    await context.close();
  });

  test("?lang=en survives opening and closing", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=en`);
    await page.click(".wall .tile");
    await page.waitForSelector("dialog.case[open]");
    expect(page.url()).toBe(`${srv.url}/?lang=en#case-1`);
    expect(await page.textContent(".case-count")).toBe("Case 01 of 10");
    expect(await page.textContent("dialog.case .case-next")).toBe("Next: AG1");
    await page.keyboard.press("Escape");
    await waitClosed(page);
    expect(page.url()).toBe(`${srv.url}/?lang=en`);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("Esc back onto a #case-3 entry shows case 3 and keeps it open", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    // Entries: [/, #case-3]. pushState does not fire hashchange, so nothing opens by itself.
    await page.evaluate(() => history.pushState(null, "", "#case-3"));
    expect(await isOpen(page)).toBe(false);
    await openTile(page, 2);
    expect(await title(page)).toBe("AG1");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("#case-title")!.textContent === "Dear Passengers", null, { timeout: 5000 });
    expect(await isOpen(page)).toBe(true);
    expect(await hash(page)).toBe("#case-3");
    // The wait for the step back used to close the case 1.5 s later.
    await page.waitForTimeout(2500);
    expect(await isOpen(page)).toBe(true);
    expect(await title(page)).toBe("Dear Passengers");
    expect(await hash(page)).toBe("#case-3");
    expect(errors).toEqual([]);
    await context.close();
  });
});

describe("player", () => {
  test("a failed video shows the poster and «Повторить», which recovers once the video loads", async () => {
    const { context, page } = await open(browser, `${srv.url}/?lang=ru`);
    await page.route(/\/media\/c1-full\.mp4/, (r) => r.abort());
    await openTile(page, 1);
    await page.waitForSelector("dialog.case .case-art.err", { timeout: 10000 });
    expect(await page.isVisible("dialog.case .case-pic")).toBe(true);
    expect(plain(await page.getAttribute("dialog.case .case-pic", "src"))).toBe("/media/c1.webp");
    expect(await page.textContent("dialog.case .case-retry")).toBe("Повторить");
    await page.unroute(/\/media\/c1-full\.mp4/);
    await page.click("dialog.case .case-retry");
    await page.waitForFunction(() => {
      const v = document.querySelector<HTMLVideoElement>("dialog.case video")!;
      return !document.querySelector("dialog.case .case-art")!.classList.contains("err") && v.readyState >= 2;
    }, null, { timeout: 10000 });
    await context.close();
  });

  test("King’s Resort & Casino (case 5) has its video, player and own page, in Russian and English", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru#case-5`);
    await page.waitForSelector("dialog.case[open]");
    expect(await page.textContent("dialog.case .case-title")).toBe("King’s Resort & Casino");
    expect(await page.textContent("dialog.case .case-eyebrow")).toBe("King’s Resort · Розвадов");
    expect(await page.textContent("dialog.case .case-sub")).toBe("Live Content Production");
    expect(await page.textContent("dialog.case .case-meta dd")).toBe("King’s Resort & Casino");
    expect(plain(await page.evaluate(() => document.querySelector("dialog.case video")!.getAttribute("src")))).toBe("/media/c5-full.mp4");
    expect(await page.isVisible("dialog.case .player")).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
    const en = await open(browser, `${srv.url}/?lang=en#case-5`);
    await en.page.waitForSelector("dialog.case[open]");
    expect(await en.page.textContent("dialog.case .case-title")).toBe("King’s Resort & Casino");
    expect(await en.page.textContent("dialog.case .case-media-tag")).toBe("The website");
    expect(en.errors).toEqual([]);
    await en.context.close();
  });

  test("a case page: meta, highlights, cards, results, logo rows and outside links", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=en#case-3`);
    await page.waitForSelector("dialog.case[open]");
    expect(await page.$$eval("dialog.case .case-meta dt", (els) => els.map((e) => e.textContent))).toEqual(["Client", "Category"]);
    expect(await page.textContent("dialog.case .case-how mark")).toBe("pure in-flight chaos");
    expect(await page.$$eval("dialog.case .case-tag", (els) => els.map((e) => e.textContent))).toEqual(["One launch", "Our role", "The results"]);
    expect(await page.$$eval("dialog.case .case-results b", (els) => els.map((e) => e.textContent))).toEqual(["100M+", "322%", "100×", "500K+"]);
    const link = page.locator("dialog.case .case-out a");
    expect(await link.textContent()).toBe("Watch on YouTube →");
    expect(await link.getAttribute("href")).toBe("https://www.youtube.com/watch?v=bH9zvvhGitY");
    expect(await link.getAttribute("target")).toBe("_blank");
    expect(await page.$$eval("dialog.case .case-result", (els) => els.map((e) => e.textContent))).toEqual(["100M+ organic views", "500K+ Steam wishlists"]);
    expect(await page.textContent("dialog.case .case-logos .mono")).toBe("Platforms");
    expect(await page.$$eval("dialog.case .case-logos .logo-mark", (els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Instagram", "YouTube", "TikTok"]);
    expect(await page.$$("dialog.case .ph-box")).toHaveLength(0);
    // Waldorf's link opens the hotel's page in the visitor's language; its press clippings open the articles.
    await page.evaluate(() => (location.hash = "#case-1"));
    await page.waitForFunction(() => document.querySelector("#case-title")!.textContent === "Waldorf Astoria Berlin");
    expect(await page.getAttribute("dialog.case .case-out a", "href")).toBe("https://www.hilton.com/en/hotels/berwawa-waldorf-astoria-berlin/");
    expect(await page.textContent("dialog.case .case-sub")).toBe("Live Content Production");
    expect(await page.$$eval("dialog.case .case-clip", (els) => els.map((e) => [e.querySelector(".logo-mark")!.getAttribute("aria-label"), e.getAttribute("target")]))).toEqual([
      ["Rolling Stone UK", "_blank"],
      ["Forbes Travel Guide", "_blank"],
      ["Condé Nast Traveler", "_blank"],
      ["Business Traveller", "_blank"],
    ]);
    expect(await page.textContent("dialog.case .case-clip .mono")).toBe("Read it →");
    // AG1 tells it in two parts, the first with no kicker; its results have no logo row.
    await page.evaluate(() => (location.hash = "#case-2"));
    await page.waitForFunction(() => document.querySelector("#case-title")!.textContent === "AG1");
    expect(await page.$$eval("dialog.case .case-how h3", (els) => els.map((e) => e.textContent))).toEqual(["Overview", "The anatomy"]);
    expect(await page.$$eval("dialog.case .case-kicker", (els) => els.map((e) => e.textContent))).toEqual(["Advertorial · Landing page · Website"]);
    expect(await page.$$eval("dialog.case .case-results b", (els) => els.map((e) => e.textContent))).toEqual(["170%", "36%", "42%", "200%"]);
    expect(await page.$$("dialog.case .case-logos")).toHaveLength(0);
    expect(await page.textContent("dialog.case .case-sub")).toBe("200% average return on ad spend");
    // DeckForge: its partners' logos under the numbers.
    await page.evaluate(() => (location.hash = "#case-8"));
    await page.waitForFunction(() => document.querySelector("#case-title")!.textContent === "DeckForge");
    expect(await page.textContent("dialog.case .case-logos .mono")).toBe("Official partners");
    expect(await page.$$eval("dialog.case .case-logos .logo-mark", (els) => els.map((e) => [e.getAttribute("aria-label"), Math.round(e.getBoundingClientRect().width)]))).toEqual([
      ["VK", 127],
      ["RuStore", 88],
      ["Xiaomi", 83],
    ]);
    expect(await page.$$("dialog.case .case-out a")).toHaveLength(0);
    expect(await page.$$("dialog.case .ph-box")).toHaveLength(0);
    // Antiquerus: a rise with no figure is the site's arrow, turned up, named for screen readers.
    await page.evaluate(() => (location.hash = "#case-7"));
    await page.waitForFunction(() => document.querySelector("#case-title")!.textContent === "Antiquerus");
    expect(await page.$$eval("dialog.case .case-results b", (els) => els.map((e) => e.querySelector(".case-up")?.getAttribute("aria-label") ?? e.textContent))).toEqual(["↑", "↑", "500+"]);
    expect(await page.$$eval("dialog.case .case-up", (els) => els.map((e) => e.getAttribute("role")))).toEqual(["img", "img"]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a case plays as soon as it opens; a click on the picture pauses it, another plays it", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    await openTile(page, 1);
    const state = () => page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>("dialog.case video")!;
      return { paused: v.paused, loop: v.loop };
    });
    await page.waitForFunction(() => {
      const v = document.querySelector<HTMLVideoElement>("dialog.case video")!;
      return !v.paused && v.currentTime > 0;
    }, null, { timeout: 10000 });
    expect(await state()).toEqual({ paused: false, loop: true });
    expect(plain(await page.getAttribute("dialog.case video", "poster"))).toBe("/media/c1.webp");
    expect(await page.textContent("dialog.case .go")).toBe("Пауза");
    await page.click("dialog.case video");
    expect((await state()).paused).toBe(true);
    expect(await page.textContent("dialog.case .go")).toBe("Смотреть");
    await page.click("dialog.case video");
    await page.waitForFunction(() => !document.querySelector<HTMLVideoElement>("dialog.case video")!.paused, null, { timeout: 5000 });
    // In full screen the browser's own controls take the click: ours must not toggle it back.
    expect(await page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>("dialog.case video")!;
      v.controls = true;
      v.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const paused = v.paused;
      v.controls = false;
      return paused;
    })).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("calm: nothing plays on its own; «Смотреть» plays it", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru#case-1`, { reducedMotion: "reduce" });
    await page.waitForSelector("dialog.case[open]");
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.querySelector<HTMLVideoElement>("dialog.case video")!.paused)).toBe(true);
    expect(await page.textContent("dialog.case .go")).toBe("Смотреть");
    await page.click("dialog.case .go");
    await page.waitForFunction(() => !document.querySelector<HTMLVideoElement>("dialog.case video")!.paused, null, { timeout: 10000 });
    expect(errors).toEqual([]);
    await context.close();
  });

  for (const id of [3, 8]) {
    test(`case ${id} opened from its tile plays at once with sound, once through; the sound button mutes it`, async () => {
      const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
      await openTile(page, id);
      await page.waitForFunction(() => {
        const v = document.querySelector<HTMLVideoElement>("dialog.case video")!;
        return !v.paused && !v.muted && v.currentTime > 0;
      }, null, { timeout: 10000 });
      expect(await page.evaluate(() => document.querySelector<HTMLVideoElement>("dialog.case video")!.loop)).toBe(false);
      expect(await page.isVisible("dialog.case .mute")).toBe(true);
      await page.click("dialog.case .mute");
      expect(await page.evaluate(() => document.querySelector<HTMLVideoElement>("dialog.case video")!.muted)).toBe(true);
      expect(errors).toEqual([]);
      await context.close();
    });
  }

  test("a browser that allows no sound before a click: the case plays muted, the sound button turns sound on", async () => {
    const strict = await chromium.launch({ args: ["--autoplay-policy=user-gesture-required"] });
    const { context, page, errors } = await open(strict, `${srv.url}/?lang=ru#case-3`);
    await page.waitForFunction(() => {
      const v = document.querySelector<HTMLVideoElement>("dialog.case video")!;
      return !v.paused && v.muted;
    }, null, { timeout: 10000 });
    await page.click("dialog.case .mute");
    expect(await page.evaluate(() => document.querySelector<HTMLVideoElement>("dialog.case video")!.muted)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
    await strict.close();
  });

  test("phone: the case plays in the open case, King's and the three newest", async () => {
    for (const id of [5, 9, 10, 11]) {
      const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru#case-${id}`, phone);
      await page.waitForFunction(() => {
        const v = document.querySelector<HTMLVideoElement>("dialog.case video")!;
        return !v.paused && v.currentTime > 0;
      }, null, { timeout: 10000 });
      expect(errors).toEqual([]);
      await context.close();
    }
  });

  test("the focus ring reads on every case colour (3:1), and inside the torn press clippings", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru#case-1`);
    await page.waitForSelector("dialog.case[open]");
    await page.keyboard.press("Tab"); // keyboard modality, so focus() shows the ring
    const ratios: Record<number, number> = {};
    for (const [i, id] of [1, 2, 3, 4, 5, 7, 8, 9, 10, 11].entries()) {
      await page.evaluate((n) => (location.hash = `#case-${n}`), id);
      await page.waitForFunction((n) => document.querySelector(".case-count")!.textContent!.includes(String(n).padStart(2, "0")), i + 1);
      await page.focus("dialog.case .case-next");
      ratios[id] = await page.evaluate(() => {
        const lum = (c: string) => {
          const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((x) => Number(x) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ring = lum(getComputedStyle(document.activeElement!).outlineColor);
        const panel = lum(getComputedStyle(document.querySelector(".case-in")!).backgroundColor);
        return Math.round(((Math.max(ring, panel) + 0.05) / (Math.min(ring, panel) + 0.05)) * 100) / 100;
      });
    }
    for (const [id, r] of Object.entries(ratios)) expect(r, `case ${id}`).toBeGreaterThanOrEqual(3);
    await page.evaluate(() => (location.hash = "#case-1"));
    await page.waitForSelector("dialog.case .case-clip");
    await page.focus("dialog.case .case-clip");
    expect(await page.$eval("dialog.case .case-clip", (e) => [getComputedStyle(e).outlineColor, parseFloat(getComputedStyle(e).outlineOffset) < 0])).toEqual(["rgb(14, 14, 14)", true]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("phone: the outside links in a case are a finger tall", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru#case-3`, phone);
    await page.waitForSelector("dialog.case[open] .case-out a");
    expect(await page.$eval("dialog.case .case-out a", (a) => a.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(errors).toEqual([]);
    await context.close();
  });
});

describe("copy link", () => {
  test("with clipboard access the link is copied", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`, { permissions: ["clipboard-read", "clipboard-write"] });
    await openTile(page, 7);
    await page.click("dialog.case .link-copy");
    await page.waitForFunction((t) => document.querySelector(".toast:not([hidden])")?.textContent === t, "Ссылка на кейс скопирована", { timeout: 2000 });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${srv.url}/?lang=ru#case-7`);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("the toast is inside the open case and really visible", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`, { permissions: ["clipboard-read", "clipboard-write"] });
    await openTile(page, 7);
    await page.click("dialog.case .link-copy");
    await page.waitForFunction((t) => document.querySelector(".toast:not([hidden])")?.textContent === t, "Ссылка на кейс скопирована", { timeout: 2000 });
    const seen = await page.evaluate(() => {
      const toast = document.querySelector<HTMLElement>(".toast")!;
      const dialog = document.querySelector<HTMLDialogElement>("dialog.case")!;
      const r = toast.getBoundingClientRect();
      // The toast never takes the pointer (pointer-events: none), so elementFromPoint would skip it;
      // let it take the pointer here to find out what is painted at its centre.
      toast.style.pointerEvents = "auto";
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { inDialog: toast.parentElement === dialog && dialog.open, size: [r.width, r.height], atToast: !!at && (at === toast || toast.contains(at)), at: at?.className };
    });
    expect(seen.inDialog).toBe(true);
    expect(seen.size[0]).toBeGreaterThan(0);
    expect(seen.size[1]).toBeGreaterThan(0);
    expect(seen.atToast).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("without clipboard access the link is shown selected", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } }));
    const page = await context.newPage();
    await page.goto(`${srv.url}/?lang=ru`, { waitUntil: "load" });
    await openTile(page, 7);
    await page.click("dialog.case .link-copy");
    await page.waitForSelector("dialog.case .case-link:not([hidden])");
    const field = await page.evaluate(() => {
      const f = document.querySelector<HTMLInputElement>("dialog.case .case-link")!;
      return { value: f.value, selected: f.selectionEnd! - f.selectionStart!, focused: document.activeElement === f };
    });
    expect(field.value).toBe(`${srv.url}/?lang=ru#case-7`);
    expect(field.selected).toBe(field.value.length);
    expect(field.focused).toBe(true);
    await page.waitForFunction((t) => document.querySelector(".toast:not([hidden])")?.textContent === t, "Скопируйте ссылку вручную", { timeout: 2000 });
    await context.close();
  });
});
