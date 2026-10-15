// Custom cursor on a desktop mouse: it shows on the page with the label of the element under it,
// and inside an open case dialog (the browser's top layer) it lives in the dialog to stay visible.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "playwright-core";
import { launch, open, startServer } from "./helpers.ts";

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
const waitClosed = (page: Page) => page.waitForFunction(() => !document.querySelector<HTMLDialogElement>("dialog.case")!.open);

// Centre of an element, scrolled into view first.
async function centre(page: Page, sel: string) {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  const box = (await el.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const cursorState = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".cursor")!;
    const cs = getComputedStyle(el);
    return {
      count: document.querySelectorAll(".cursor").length,
      parent: el.parentElement?.matches("dialog.case") ? "case" : el.parentElement === document.body ? "body" : (el.parentElement?.className ?? ""),
      on: el.classList.contains("on"),
      word: el.classList.contains("word"),
      label: el.querySelector(".c-label")!.textContent,
      opacity: Number(cs.opacity),
      visibility: cs.visibility,
      display: cs.display,
      pageHasCursor: document.documentElement.classList.contains("has-cursor"),
    };
  });

describe("custom cursor", () => {
  test("moving the mouse over the page shows the cursor; over a labelled element it shows the label", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    expect(await page.locator(".cursor").count()).toBe(1);
    await page.mouse.move(700, 450, { steps: 4 });
    await page.waitForFunction(() => {
      const el = document.querySelector<HTMLElement>(".cursor")!;
      return el.classList.contains("on") && getComputedStyle(el).opacity === "1";
    }, null, { timeout: 5000 });
    const shown = await cursorState(page);
    expect(shown).toMatchObject({ count: 1, on: true, opacity: 1, visibility: "visible", pageHasCursor: true });
    expect(await page.evaluate(() => document.querySelector<HTMLElement>(".cursor")!.style.translate)).toBe("700px 450px");

    const tile = await centre(page, tileSel(2));
    await page.mouse.move(tile.x, tile.y, { steps: 4 });
    await page.waitForFunction(() => document.querySelector(".cursor")!.classList.contains("word"), null, { timeout: 5000 });
    expect(await page.locator(tileSel(2)).getAttribute("data-cursor")).toBe("смотреть");
    expect((await cursorState(page)).label).toBe("смотреть");
    // The pill is scaled up from nothing: its text takes room on screen.
    await page.waitForFunction(() => document.querySelector(".cursor .c-label")!.getBoundingClientRect().width > 10, null, { timeout: 5000 });
    expect(errors).toEqual([]);
    await context.close();
  });

  test("with a case open the cursor lives inside the dialog and is visible there", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    await page.click(tileSel(2));
    await page.waitForSelector("dialog.case[open]");
    await page.waitForFunction(() => document.querySelector("dialog.case")!.getAnimations({ subtree: true }).length === 0, null, { timeout: 8000 });
    // The cursor moves into the dialog with the next mouse move.
    const x = await centre(page, "dialog.case .case-x");
    await page.mouse.move(x.x, x.y, { steps: 4 });
    await page.waitForFunction(() => {
      const el = document.querySelector<HTMLElement>(".cursor")!;
      return el.parentElement === document.querySelector("dialog.case") && el.classList.contains("on") && getComputedStyle(el).opacity === "1";
    }, null, { timeout: 5000 });
    const inside = await cursorState(page);
    expect(inside).toMatchObject({ count: 1, parent: "case", on: true, opacity: 1, visibility: "visible", pageHasCursor: true });
    expect(inside.display).not.toBe("none");
    // The close cross carries its own label.
    await page.waitForFunction(() => document.querySelector(".cursor")!.classList.contains("word"), null, { timeout: 5000 });
    expect((await cursorState(page)).label).toBe("закрыть");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("after the case closes, the next mouse move brings the cursor back to the page", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    await page.click(tileSel(2));
    await page.waitForSelector("dialog.case[open]");
    await page.mouse.move(700, 450, { steps: 4 });
    await page.waitForFunction(() => document.querySelector(".cursor")!.parentElement === document.querySelector("dialog.case"), null, { timeout: 5000 });
    await page.keyboard.press("Escape");
    await waitClosed(page);
    await page.mouse.move(720, 460, { steps: 4 });
    await page.waitForFunction(() => document.querySelector(".cursor")!.parentElement === document.body, null, { timeout: 5000 });
    expect(await cursorState(page)).toMatchObject({ count: 1, parent: "body", on: true, opacity: 1, visibility: "visible" });
    expect(errors).toEqual([]);
    await context.close();
  });
});
