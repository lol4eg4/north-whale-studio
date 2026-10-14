// The finale: the whale slingshot under the footer. Keyboard launch, a pointer shot aimed at the
// studio name (the pull is computed here from the page geometry and the slingshot's physics),
// plan B, calm, phone layout.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "playwright-core";
import { circleHitsBox, fall, gravity, isRocket, launch as shoot, layout, maxSpeed, type Vec } from "../../plugins/slingshot/physics.ts";
import { launch, open, phone, startServer } from "./helpers.ts";

let server: { url: string; stop: () => void };
let browser: Browser;

beforeAll(async () => {
  server = await startServer();
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
  server?.stop();
});

// Scroll to the end of the page and let the whale drop into the sling and settle.
async function toFinale(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(2500);
}

const countText = (page: Page) => page.locator(".ss-count").textContent();

// The pull that sends the whale through the middle of the studio name, without the rocket.
async function pullAtName(page: Page): Promise<Vec> {
  const m = await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("#finale")!;
    const copy = s.querySelector<HTMLElement>(".ss-copy")!;
    const h2 = s.querySelector<HTMLElement>("h2")!;
    const sub = s.querySelector<HTMLElement>(".ss-sub")!;
    const r = s.getBoundingClientRect();
    const l = document.querySelector("header .logo")!.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      W: s.clientWidth,
      H: s.clientHeight,
      copyBottom: copy.offsetTop + copy.offsetHeight,
      copyRight: copy.offsetLeft + Math.max(h2.offsetWidth, sub.offsetWidth),
      vw: innerWidth,
      vh: innerHeight,
      logo: { left: l.left, top: l.top, right: l.right, bottom: l.bottom },
    };
  });
  const geo = layout(m.W, m.H, m.vw <= 700 ? 140 : 64, m.copyBottom, m.copyRight);
  const R = { x: m.left + geo.R.x, y: m.top + geo.R.y };
  const g = gravity(m.vh);
  const vmax = maxSpeed(g, R.y, geo.whaleH, m.vh);
  const cx = (m.logo.left + m.logo.right) / 2;
  const cy = (m.logo.top + m.logo.bottom) / 2;
  const edge = geo.whaleW * 0.5;
  let best: { pull: Vec; miss: number } | null = null;
  for (let deg = 5; deg <= 85; deg += 0.25)
    for (let power = 0.4; power <= 1; power += 0.01) {
      const a = (deg * Math.PI) / 180;
      const pull = { x: -Math.sign(cx - R.x) * Math.cos(a) * power * geo.maxPull, y: Math.sin(a) * power * geo.maxPull };
      const shot = shoot(pull, geo.maxPull, vmax)!;
      if (isRocket(shot.ux, shot.uy, shot.power)) continue;
      const b = { x: R.x + pull.x, y: R.y + pull.y, vx: shot.vx, vy: shot.vy };
      let miss = Infinity;
      for (let i = 0; i < 480 && b.x > -edge && b.x < m.vw + edge && b.y > -edge && b.y < m.vh + edge; i++) {
        fall(b, g, 1 / 120);
        if (circleHitsBox(b.x, b.y, geo.rad, m.logo)) miss = Math.min(miss, Math.hypot(b.x - cx, b.y - cy));
      }
      if (miss < (best?.miss ?? Infinity)) best = { pull, miss };
    }
  if (!best) throw new Error("No shot from the sling reaches the studio name");
  return best.pull;
}

async function shootWith(page: Page, pull: Vec) {
  const r = (await page.locator(".ss-grab").boundingBox())!;
  const x = r.x + r.width / 2;
  const y = r.y + r.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + pull.x, y + pull.y, { steps: 10 });
  await page.mouse.up();
}

describe("finale", () => {
  test("renders below the footer with zero console errors", async () => {
    const { context, page, errors } = await open(browser, server.url);
    await toFinale(page);
    const at = await page.evaluate(() => {
      const foot = document.querySelector("footer")!;
      const fin = document.querySelector<HTMLElement>("#finale")!;
      return {
        after: !!(foot.compareDocumentPosition(fin) & Node.DOCUMENT_POSITION_FOLLOWING),
        gap: fin.getBoundingClientRect().top - foot.getBoundingClientRect().bottom,
        title: fin.querySelector("h2")!.textContent,
        link: fin.querySelector(".ss-out")!.getAttribute("href"),
        canvas: fin.querySelector("canvas")!.width,
      };
    });
    expect(at.after).toBe(true);
    expect(at.gap).toBeGreaterThanOrEqual(0);
    expect(at.title).toBe("Устали листать? Запустите кита.");
    expect(at.link).toBe("#contacts");
    expect(at.canvas).toBeGreaterThan(0);
    expect(await countText(page)).toBe("Китов запущено: 0");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("keyboard: focus the sling, ArrowDown, ArrowLeft, Enter launches", async () => {
    const { context, page, errors } = await open(browser, server.url);
    await toFinale(page);
    const sling = page.getByRole("button", { name: "Рогатка с китом: стрелки тянут, Enter запускает" });
    await sling.focus();
    expect(await page.locator(".ss-hint").textContent()).toBe("Стрелки тянут, Enter отпускает");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    expect(await countText(page)).toBe("Китов запущено: 1");
    // A second Enter while the whale is in the air is ignored.
    await page.keyboard.press("Enter");
    expect(await countText(page)).toBe("Китов запущено: 1");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a shot aimed at the studio name scores 100", async () => {
    const { context, page, errors } = await open(browser, server.url);
    await toFinale(page);
    await shootWith(page, await pullAtName(page));
    await page.waitForFunction(() => document.querySelector(".toast")?.textContent?.includes("+100"), null, { timeout: 4000 });
    expect(await page.locator(".toast").textContent()).toBe("Прямо в название! +100");
    expect(await page.locator(".ss-score b").textContent()).toBe("100");
    expect(await page.evaluate(() => localStorage.getItem("nws.best"))).toBe("100");
    expect(await countText(page)).toBe("Китов запущено: 1");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("plan B is a button", async () => {
    const { context, page } = await open(browser, server.url);
    const planB = page.getByRole("button", { name: "План Б: пусть кит споёт" });
    expect(await planB.count()).toBe(1);
    expect(await planB.evaluate((el) => el.tagName)).toBe("BUTTON");
    await context.close();
  });

  test("calm: a launch still counts", async () => {
    const { context, page, errors } = await open(browser, server.url, { reducedMotion: "reduce" });
    await toFinale(page);
    await page.locator(".ss-grab").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    expect(await countText(page)).toBe("Китов запущено: 1");
    // Calm: a short flight, then the whale pops back into the sling.
    await page.waitForTimeout(3000);
    await shootWith(page, { x: 60, y: 40 });
    expect(await countText(page)).toBe("Китов запущено: 2");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("phone 390x844: the sling is under the copy, nothing overflows sideways", async () => {
    const { context, page, errors } = await open(browser, server.url, phone);
    await toFinale(page);
    const box = await page.evaluate(() => {
      const fin = document.querySelector<HTMLElement>("#finale")!;
      const copy = fin.querySelector(".ss-copy")!.getBoundingClientRect();
      const grab = fin.querySelector(".ss-grab")!.getBoundingClientRect();
      const wide = [...fin.querySelectorAll("*")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > innerWidth + 0.5 || r.left < -0.5;
      });
      return { copyBottom: copy.bottom, grabTop: grab.top, grabLeft: grab.left, overflow: document.documentElement.scrollWidth - innerWidth, wide: wide.length };
    });
    expect(box.grabTop).toBeGreaterThan(box.copyBottom);
    expect(box.grabLeft).toBeGreaterThanOrEqual(0);
    expect(box.overflow).toBeLessThanOrEqual(0);
    expect(box.wide).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
  });
});
