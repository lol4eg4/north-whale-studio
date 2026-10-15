// Roll call on every wall width: the team block leads the wall, all four badges are on screen
// while they hop, and the wall has no holes afterwards (on 6 columns it had 18, on 8 it had 8).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser } from "playwright-core";
import { launch, open, phone, startServer, wallHoles } from "./helpers.ts";

let server: { url: string; stop(): void };
let browser: Browser;

beforeAll(async () => {
  [server, browser] = await Promise.all([startServer("app.json"), launch()]);
});
afterAll(async () => {
  await browser?.close();
  server?.stop();
});

const SIZES = [
  ["1440x900", { viewport: { width: 1440, height: 900 } }, 8],
  ["1024x768", { viewport: { width: 1024, height: 768 } }, 6],
  ["phone", phone, 2],
] as const;

describe("roll call", () => {
  for (const [name, options, cols] of SIZES) {
    test(`${name}: team block first, badges on screen, no holes after`, async () => {
      const { context, page, errors } = await open(browser, `${server.url}/?lang=ru`, options);
      await page.locator("#team .team-block").click();
      await page.waitForSelector(".wall.rollcall", { timeout: 10000 });
      expect(await page.evaluate(() => document.querySelector(".wall > .cell")!.id)).toBe("team");
      const badges = await page.evaluate(() =>
        [...document.querySelectorAll(".wall .tag-cell")].map((c) => {
          const r = c.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight;
        }),
      );
      expect(badges).toEqual([true, true, true, true]);
      await page.waitForFunction(() => !document.querySelector(".wall.rollcall"), null, { timeout: 8000 });
      await page.waitForTimeout(1000); // the cells' spring back to place
      expect(await wallHoles(page)).toEqual({ cols, holes: 0 });
      expect(errors).toEqual([]);
      await context.close();
    });
  }
});
