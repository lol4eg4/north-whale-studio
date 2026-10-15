// Service card: opened from a service sticker on the wall; its buttons, Esc, close, phone sheet.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "playwright-core";
import { launch, open, phone, startServer } from "./helpers.ts";

let srv: { url: string; stop(): void };
let browser: Browser;

beforeAll(async () => {
  [srv, browser] = await Promise.all([startServer("app.json"), launch()]);
});
afterAll(async () => {
  await browser?.close();
  srv?.stop();
});

const isOpen = (page: Page) => page.evaluate(() => document.querySelector<HTMLDialogElement>("dialog.svc-card")!.open);
const waitClosed = (page: Page) => page.waitForFunction(() => !document.querySelector<HTMLDialogElement>("dialog.svc-card")!.open);
const focusIs = (page: Page, sel: string) => page.evaluate((s) => document.activeElement === document.querySelector(s), sel);

describe("service card", () => {
  test("a service sticker opens its card; Esc closes it and focus returns to the sticker", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    await page.click(".wall .svc");
    await page.waitForSelector("dialog.svc-card[open]");
    expect(await page.textContent("#svc-title")).toBe("Упаковка бизнеса");
    expect(await page.textContent("dialog.svc-card .sc-top .mono")).toBe("Услуга");
    expect(await page.locator("dialog.svc-card li").count()).toBe(4);
    expect(await focusIs(page, "dialog.svc-card .sc-x")).toBe(true);
    await page.keyboard.press("Escape");
    await waitClosed(page);
    expect(await focusIs(page, ".wall .svc")).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("the main service card; its close button closes it", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    await page.click("#services button");
    await page.waitForSelector("dialog.svc-card[open]");
    expect(await page.textContent("#svc-title")).toBe("Сайты под ключ");
    expect(await page.textContent("dialog.svc-card .sc-top .mono")).toBe("Услуга · наша специальность");
    await page.click("dialog.svc-card .sc-x");
    await waitClosed(page);
    expect(await focusIs(page, "#services button")).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("«Обсудить проект» goes to contacts, «Смотреть кейсы» to the wall", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`);
    await page.click(".wall .svc");
    await page.waitForSelector("dialog.svc-card[open]");
    await page.click("dialog.svc-card .btn-action");
    await waitClosed(page);
    await page.waitForFunction(() => location.hash === "#contacts");

    await page.click(".wall .svc");
    await page.waitForSelector("dialog.svc-card[open]");
    await page.click("dialog.svc-card .sc-actions .btn:not(.btn-action)");
    await waitClosed(page);
    await page.waitForFunction(() => location.hash === "#cases");
    expect(await isOpen(page)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("the card follows the language", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=en`);
    await page.click("#services button");
    await page.waitForSelector("dialog.svc-card[open]");
    expect(await page.textContent("#svc-title")).toBe("Turnkey websites");
    expect(await page.textContent("dialog.svc-card .btn-action")).toBe("Discuss a project");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("on a phone the card is a bottom sheet", async () => {
    const { context, page, errors } = await open(browser, `${srv.url}/?lang=ru`, phone);
    await page.locator(".wall .svc").first().scrollIntoViewIfNeeded();
    await page.locator(".wall .svc").first().tap();
    await page.waitForSelector("dialog.svc-card[open]");
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const b = document.querySelector(".sc")!.getBoundingClientRect();
      return { left: b.left, right: b.right, bottom: b.bottom, w: innerWidth, h: innerHeight };
    });
    expect(Math.abs(r.bottom - r.h)).toBeLessThan(2);
    expect(Math.abs(r.left)).toBeLessThan(1);
    expect(Math.abs(r.right - r.w)).toBeLessThan(1);
    await page.tap("dialog.svc-card .sc-x");
    await waitClosed(page);
    expect(errors).toEqual([]);
    await context.close();
  });
});
