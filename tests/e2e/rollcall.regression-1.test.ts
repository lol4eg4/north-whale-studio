// Regression: ISSUE-001 — Enter on the team block dropped keyboard focus to <body>
// Found by /qa on 2026-10-15
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-10-15.md
// The roll call and the random case's shuffle move the wall's cells in the page; a moved cell lost
// the focus inside it, so a keyboard user lost their place and the focus ring.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "playwright-core";
import { launch, open, startServer } from "./helpers.ts";

let server: { url: string; stop(): void };
let browser: Browser;

beforeAll(async () => {
  [server, browser] = await Promise.all([startServer("app.json"), launch()]);
});
afterAll(async () => {
  await browser?.close();
  server?.stop();
});

// The focused element's class and whether it shows the focus ring.
const focus = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    return { cls: String(a.className).split(" ")[0], ring: a.matches(":focus-visible") };
  });

describe("keyboard focus when the wall reorders", () => {
  test("Enter on the team block: the block keeps focus and its ring through the roll call", async () => {
    const { context, page, errors } = await open(browser, `${server.url}/?lang=ru`);
    await page.locator("#team .team-block").focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector(".wall.rollcall", { timeout: 10000 });
    expect(await focus(page)).toEqual({ cls: "team-block", ring: true });
    await page.waitForFunction(() => !document.querySelector(".wall.rollcall"), null, { timeout: 8000 });
    expect(await focus(page)).toEqual({ cls: "team-block", ring: true });
    // Tab goes on from the block's new place: the next control after it in the wall.
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.querySelector(".wall")!.contains(document.activeElement))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("Enter on the wall's random case card: the card keeps focus while the wall shuffles", async () => {
    const { context, page, errors } = await open(browser, `${server.url}/?lang=ru`);
    // Number the cells, then wait until the shuffle has moved them.
    await page.evaluate(() => document.querySelectorAll<HTMLElement>(".wall > .cell").forEach((c, i) => (c.dataset.at = String(i))));
    await page.locator(".wall .dive-card").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>(".wall > .cell")].some((c, i) => c.dataset.at !== String(i)), null, { timeout: 5000 });
    expect(await focus(page)).toEqual({ cls: "dive-card", ring: true });
    expect(errors).toEqual([]);
    await context.close();
  });
});
