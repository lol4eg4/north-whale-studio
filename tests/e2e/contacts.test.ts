// Contacts: copy the email (clipboard allowed and refused), the mailto: link, the placeholders.
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Browser } from "playwright-core";
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

const EMAIL = "hello@northwhale.studio";

test("copy with clipboard permission: «Скопировано», the toast, the address on the clipboard", async () => {
  const { context, page, errors } = await open(browser, server.url, { permissions: ["clipboard-read", "clipboard-write"] });
  const copy = page.locator(".contact-copy");
  await copy.scrollIntoViewIfNeeded();
  expect(await copy.textContent()).toBe("Скопировать почту");
  await copy.click();
  await page.waitForFunction(() => document.querySelector(".contact-copy")?.textContent === "Скопировано", undefined, { timeout: 2000 });
  expect(await page.locator(".toast").textContent()).toBe("Почта скопирована. Ждём письма!");
  expect(await page.locator(".toast").isVisible()).toBe(true);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(EMAIL);
  // The label comes back after 2.4 s.
  await page.waitForTimeout(2600);
  expect(await copy.textContent()).toBe("Скопировать почту");
  expect(errors).toEqual([]);
  await context.close();
});

test("clipboard refused: the address is selected and the hint shows", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) } });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(server.url, { waitUntil: "load" });
  await page.locator(".contact-copy").scrollIntoViewIfNeeded();
  await page.click(".contact-copy");
  await page.waitForFunction(() => getSelection()?.toString() === "hello@northwhale.studio", undefined, { timeout: 2000 });
  expect(await page.locator(".toast").textContent()).toBe("Почта выделена: скопируйте её вручную");
  expect(await page.locator(".contact-copy").textContent()).toBe("Скопировать почту");
  expect(errors).toEqual([]);
  await context.close();
});

test("no clipboard at all: the address is selected too", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
  await context.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }));
  const page = await context.newPage();
  await page.goto(server.url, { waitUntil: "load" });
  await page.locator(".contact-copy").scrollIntoViewIfNeeded();
  await page.click(".contact-copy");
  await page.waitForFunction(() => getSelection()?.toString() === "hello@northwhale.studio", undefined, { timeout: 2000 });
  await context.close();
});

test("the email is a mailto: link and not a piece; messengers and socials are stamped placeholders", async () => {
  const { context, page } = await open(browser, server.url);
  const email = await page.evaluate(() => {
    const a = document.querySelector<HTMLAnchorElement>("#contacts a.contact-email")!;
    return { href: a.getAttribute("href"), text: a.textContent, piece: a.closest("[data-piece]") !== null };
  });
  expect(email).toEqual({ href: `mailto:${EMAIL}`, text: EMAIL, piece: false });
  const reach = await page.evaluate(() => ({
    links: document.querySelectorAll("#contacts .contact-reach a").length,
    chips: [...document.querySelectorAll("#contacts .contact-ph")].map((c) => c.textContent),
    stamps: document.querySelectorAll("#contacts .contact-reach .stamp").length,
  }));
  expect(reach.links).toBe(0);
  expect(reach.chips).toEqual(["Telegram @northwhale", "WhatsApp +7 000 000-00-00", "Behance", "VK"]);
  expect(reach.stamps).toBe(2);
  // The menu shows the address too.
  expect(await page.locator(".menu-foot .menu-mail a").getAttribute("href")).toBe(`mailto:${EMAIL}`);
  await context.close();
});
