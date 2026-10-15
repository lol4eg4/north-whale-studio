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

const tileSel = (id: number) => `.wall .tile[aria-label^="Кейс ${id}."]`;
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
    expect(await page.textContent(".case-count")).toBe("Кейс 02 из 08");
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
    await openTile(page, 7);
    expect(await title(page)).toBe("Пространство времени");
    expect(await page.textContent("dialog.case .case-next")).toBe("Дальше: DeckForge");
    await page.click("dialog.case .case-next");
    await page.waitForFunction(() => document.querySelector("#case-title")!.textContent === "DeckForge");
    expect(await hash(page)).toBe("#case-8");
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    expect(await page.textContent("dialog.case .case-next")).toBe("Назад к стене");
    await page.click("dialog.case .case-next");
    await waitClosed(page);
    expect(await hash(page)).toBe("");
    expect(await focusIs(page, tileSel(8))).toBe(true);
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
    expect(await page.textContent(".case-count")).toBe("Case 01 of 08");
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
    expect(await page.textContent("dialog.case .case-title")).toBe("По-королевски");
    expect(await page.textContent("dialog.case .case-eyebrow")).toBe("King’s Resort · Розвадов");
    expect(await page.isVisible("dialog.case .case-sub")).toBe(false);
    expect(await page.textContent("dialog.case .case-meta dd")).toBe("King’s Resort & Casino");
    expect(plain(await page.evaluate(() => document.querySelector("dialog.case video")!.getAttribute("src")))).toBe("/media/c5-full.mp4");
    expect(await page.isVisible("dialog.case .player")).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
    const en = await open(browser, `${srv.url}/?lang=en#case-5`);
    await en.page.waitForSelector("dialog.case[open]");
    expect(await en.page.textContent("dialog.case .case-title")).toBe("Like a King");
    expect(await en.page.textContent("dialog.case .case-media-tag")).toBe("The website");
    expect(en.errors).toEqual([]);
    await en.context.close();
  });

  test("a case page: meta, highlights, cards, results and outside links; a case with no page keeps its placeholders", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=en#case-3`);
    await page.waitForSelector("dialog.case[open]");
    expect(await page.$$eval("dialog.case .case-meta dt", (els) => els.map((e) => e.textContent))).toEqual(["Client", "Category", "Services"]);
    expect(await page.textContent("dialog.case .case-how mark")).toBe("pure in-flight chaos");
    expect(await page.$$eval("dialog.case .case-tag", (els) => els.map((e) => e.textContent))).toEqual(["One launch", "Our role", "The results"]);
    expect(await page.$$eval("dialog.case .case-results b", (els) => els.map((e) => e.textContent))).toEqual(["100M+", "322%", "100×", "500K+"]);
    const link = page.locator("dialog.case .case-out a");
    expect(await link.textContent()).toBe("Watch the trailer →");
    expect(await link.getAttribute("href")).toBe("https://www.youtube.com/watch?v=bH9zvvhGitY");
    expect(await link.getAttribute("target")).toBe("_blank");
    expect(await page.$$("dialog.case .ph-box")).toHaveLength(0);
    // Waldorf's link opens the hotel's page in the visitor's language.
    await page.evaluate(() => (location.hash = "#case-1"));
    await page.waitForFunction(() => document.querySelector("#case-title")!.textContent === "Berlin Deco");
    expect(await page.getAttribute("dialog.case .case-out a", "href")).toBe("https://www.hilton.com/en/hotels/berwawa-waldorf-astoria-berlin/");
    await page.evaluate(() => (location.hash = "#case-2"));
    await page.waitForFunction(() => document.querySelector("#case-title")!.textContent === "AG1");
    expect(await page.$$("dialog.case .ph-box")).toHaveLength(3);
    expect(await page.isVisible("dialog.case .case-eyebrow")).toBe(false);
    expect(await page.isVisible("dialog.case .case-media-tag")).toBe(false);
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

  for (const id of [3, 6, 8]) {
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

  test("phone: the case plays in the open case", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru#case-5`, phone);
    await page.waitForFunction(() => {
      const v = document.querySelector<HTMLVideoElement>("dialog.case video")!;
      return !v.paused && v.currentTime > 0;
    }, null, { timeout: 10000 });
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
