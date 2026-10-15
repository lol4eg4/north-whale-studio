// Screenshots for the visual check: RU and EN at 1440x900, 1024x768 and 390x844, the first
// screen and the whole page, plus an open case and the open menu. Writes to tmp/shots/.
//   bun tests/e2e/shots.ts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { launch, open, phone, startServer } from "./helpers.ts";

const out = join(import.meta.dir, "..", "..", "tmp", "shots");
mkdirSync(out, { recursive: true });
const server = await startServer();
const browser = await launch();
const sizes = [
  ["1440", { viewport: { width: 1440, height: 900 } }],
  ["1024", { viewport: { width: 1024, height: 768 } }],
  ["390", phone],
] as const;
const failures: string[] = [];
try {
  for (const lang of ["ru", "en"]) {
    for (const [name, options] of sizes) {
      const { context, page, errors } = await open(browser, `${server.url}/?lang=${lang}`, options);
      // Headless Chromium parks the mouse at 0,0, where the custom cursor would show.
      await page.addStyleTag({ content: ".cursor{display:none!important}" });
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(out, `${lang}-${name}-first.png`) });
      // Posters load and marks draw near the screen: scroll the page through once, a frame or
      // so per step, before the full shot. (The finale's whale lives on a screen-sized canvas, so
      // the full shot leaves it out; see the finale on screen instead.)
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 500) {
        await page.evaluate((top) => scrollTo({ top, behavior: "instant" }), y);
        await page.waitForTimeout(60);
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(out, `${lang}-${name}-full.png`), fullPage: true });
      await page.locator(".wall .tile").first().click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(out, `${lang}-${name}-case.png`) });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      if (await page.locator(".nav .plus").isVisible()) {
        await page.locator(".nav .plus").click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(out, `${lang}-${name}-menu.png`) });
        await page.keyboard.press("Escape");
      }
      if (errors.length) failures.push(`${lang} ${name}: ${errors.join(" | ")}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.stop();
}
console.log(`Screenshots in ${out}`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
