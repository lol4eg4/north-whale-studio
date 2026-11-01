// Contacts: calls to the bot and the support account in Telegram (no handles), the QR card (not on phones), the bot
// everywhere else on the page; no email, personal Telegram or WhatsApp left.
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser } from "playwright-core";
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

const BOT = "https://t.me/North_Whale_Studio_Bot";
const SUPPORT = "https://t.me/NORTH_WHALE_STUDIO";

test("the bot and the support account are links that open in a new tab; the QR card leads to the bot", async () => {
  const { context, page, errors } = await open(browser, server.url);
  const links = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>("#contacts a")].map((a) => [a.className.replace(" piece", ""), a.textContent, a.getAttribute("href"), a.target, a.rel]),
  );
  expect(links).toEqual([
    ["contact-bot", "Наш бот в Телеграм", BOT, "_blank", "noopener"],
    ["btn", "Поддержка в Телеграм", SUPPORT, "_blank", "noopener"],
    ["contact-qr", "QR — бот North Whale Studio", BOT, "_blank", "noopener"],
  ]);
  const qr = page.locator(".contact-qr");
  await qr.scrollIntoViewIfNeeded();
  expect(await qr.isVisible()).toBe(true);
  // The QR loads lazily, once the card is near the screen.
  await page.waitForFunction(() => (document.querySelector<HTMLImageElement>(".contact-qr img")?.naturalWidth ?? 0) > 0, undefined, { timeout: 5000 });
  expect(await page.locator(".contact-qr img").getAttribute("alt")).toBe("QR-код: бот North Whale Studio в Telegram");
  // No socials until the studio sends them.
  expect(await page.locator("#contacts .stamp").count()).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});

test("the footer, the wall sticker and the menu lead to the bot; the old contacts are gone everywhere", async () => {
  const { context, page } = await open(browser, server.url);
  const elsewhere = await page.evaluate(() => ({
    foot: document.querySelector<HTMLAnchorElement>("a.foot-tg")?.target + " " + document.querySelector(".foot-tg")?.getAttribute("href"),
    wall: [...document.querySelectorAll<HTMLAnchorElement>(".wall a.client")].find((a) => a.textContent?.startsWith("Telegram"))?.getAttribute("href"),
    menu: document.querySelector(".menu-foot .menu-tg a")?.getAttribute("href"),
    old: /alfacatalyst|romansmirn0v|wa\.me|mailto:|whatsapp|9522030362/i.test(document.documentElement.outerHTML),
  }));
  expect(elsewhere).toEqual({ foot: `_blank ${BOT}`, wall: BOT, menu: BOT, old: false });
  await context.close();
});

test("on a phone the QR card is hidden, the buttons stay and the page does not scroll sideways", async () => {
  const { context, page } = await open(browser, server.url, phone);
  await page.locator(".contact-bot").scrollIntoViewIfNeeded();
  expect(await page.locator(".contact-qr").isVisible()).toBe(false);
  expect(await page.locator(".contact-bot").isVisible()).toBe(true);
  expect(await page.locator("#contacts a.btn").isVisible()).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
