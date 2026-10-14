// The link preview picture: the Russian first screen at 1200x630, saved as site/og.jpg.
//   bun tests/e2e/og.ts
import { join } from "node:path";
import { launch, open, startServer } from "./helpers.ts";

const server = await startServer();
const browser = await launch();
try {
  const { page, errors } = await open(browser, server.url, { viewport: { width: 1200, height: 630 }, reducedMotion: "reduce" });
  // A still picture: no floating controls, and no custom cursor (headless Chromium parks the mouse at 0,0).
  await page.addStyleTag({ content: ".cursor,.ctrl,.dock{display:none!important}" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(import.meta.dir, "..", "..", "site", "og.jpg"), type: "jpeg", quality: 82 });
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
  server.stop();
}
