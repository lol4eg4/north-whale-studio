// The finale: the whale slingshot under the footer. Keyboard launch, a pointer shot aimed at the
// studio name (the pull is computed here from the page geometry and the slingshot's physics),
// the first pull launches (whale caught as it drops in, pressed at its tail or nose, on a phone),
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

// The sling as the slingshot lays it out: its geometry, the pocket's rest point on screen, the page.
async function slingAt(page: Page) {
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
  return { m, geo, R: { x: m.left + geo.R.x, y: m.top + geo.R.y } };
}

// The pull that sends the whale through the middle of the studio name, without the rocket.
async function pullAtName(page: Page): Promise<Vec> {
  const { m, geo, R } = await slingAt(page);
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

// The whale as drawn on the finale canvas (its cobalt body), in viewport px: centre, tail tip, nose tip.
function drawnWhale(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(".ss-canvas")!;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let tail = { x: Infinity, y: 0 };
    let nose = { x: -Infinity, y: 0 };
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 250 || Math.abs(d[i] - 0x2f) > 24 || Math.abs(d[i + 1] - 0x4b) > 24 || d[i + 2] < 230) continue;
      const x = r.left + ((i / 4) % c.width) / k;
      const y = r.top + Math.floor(i / 4 / c.width) / k;
      n++;
      sx += x;
      sy += y;
      if (x < tail.x) tail = { x, y };
      if (x > nose.x) nose = { x, y };
    }
    if (!n) throw new Error("No whale on the finale canvas");
    return { centre: { x: sx / n, y: sy / n }, tail, nose };
  });
}

// The page's clock stopped, scroll to the end and let `ms` of it run: the whale is `ms` into its drop.
async function toFinaleDropping(page: Page, ms: number) {
  await page.clock.install();
  await page.reload({ waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(200); // the scroll event and the sling's first frame on screen
  await page.clock.runFor(ms);
}

async function mousePull(page: Page, at: Vec, pull: Vec) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + pull.x, at.y + pull.y, { steps: 10 });
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

  test("a press on the whale as it drops in catches it, and the first pull launches", async () => {
    const { context, page } = await open(browser, server.url);
    await toFinaleDropping(page, 550);
    const { geo, R } = await slingAt(page);
    const whale = await drawnWhale(page);
    // In the air: more than a whale's height above its place in the sling.
    expect(whale.centre.y).toBeLessThan(R.y - geo.S * 0.14 - geo.whaleH);
    await mousePull(page, whale.centre, { x: -60, y: 90 });
    expect(await countText(page)).toBe("Китов запущено: 1");
    await context.close();
  });

  test("a press at the tip of the whale's tail or nose launches", async () => {
    for (const tip of ["tail", "nose"] as const) {
      const { context, page, errors } = await open(browser, server.url);
      await toFinale(page);
      const whale = await drawnWhale(page);
      const at = { x: whale[tip].x + (tip === "tail" ? 2 : -2), y: whale[tip].y };
      await mousePull(page, at, { x: -60, y: 90 });
      expect(await countText(page), tip).toBe("Китов запущено: 1");
      expect(errors).toEqual([]);
      await context.close();
    }
  });

  test("phone: a touch pull launches on the first try, even on the whale as it drops in", async () => {
    const { context, page } = await open(browser, server.url, phone);
    const cdp = await context.newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await toFinaleDropping(page, 600);
    const { geo, R } = await slingAt(page);
    const whale = await drawnWhale(page);
    expect(whale.centre.y).toBeLessThan(R.y - geo.S * 0.14 - geo.whaleH);
    const before = await page.evaluate(() => scrollY);
    await touch("touchStart", whale.centre.x, whale.centre.y);
    for (let i = 1; i <= 10; i++) await touch("touchMove", whale.centre.x - i * 5, whale.centre.y + i * 9);
    await touch("touchEnd");
    expect(await countText(page)).toBe("Китов запущено: 1");
    // The pull moved the whale, not the page.
    expect(await page.evaluate(() => scrollY)).toBe(before);
    await context.close();
  });

  test("a press on the whale lying on the ground catches it, and the pull launches", async () => {
    const { context, page, errors } = await open(browser, server.url);
    await toFinale(page);
    const { centre } = await drawnWhale(page);
    await mousePull(page, centre, { x: 0, y: -40 }); // pulled up: a weak shot into the ground
    expect(await countText(page)).toBe("Китов запущено: 1");
    await page.waitForTimeout(1000); // it bounces, then lies still (it pops home only after 2.5 s)
    const lying = await drawnWhale(page);
    expect(Math.hypot(lying.centre.x - centre.x, lying.centre.y - centre.y)).toBeGreaterThan(20);
    await mousePull(page, lying.centre, { x: -60, y: 90 });
    expect(await countText(page)).toBe("Китов запущено: 2");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("a click or a pull under 16 px is not a shot; a pull after it is", async () => {
    const { context, page, errors } = await open(browser, server.url);
    await toFinale(page);
    const { centre } = await drawnWhale(page);
    await page.mouse.click(centre.x, centre.y);
    await mousePull(page, centre, { x: -6, y: 9 });
    await page.waitForTimeout(300);
    expect(await countText(page)).toBe("Китов запущено: 0");
    await mousePull(page, centre, { x: -60, y: 90 });
    expect(await countText(page)).toBe("Китов запущено: 1");
    expect(errors).toEqual([]);
    await context.close();
  });

  test("mouse: one stray move with no button keeps the pull; two in a row (a lost button-up) put the whale back", async () => {
    const { context, page, errors } = await open(browser, server.url);
    await toFinale(page);
    await page.evaluate(() => {
      document.addEventListener("pointerdown", (e) => ((window as unknown as { __pid: number }).__pid = e.pointerId), true);
    });
    const { centre } = await drawnWhale(page);
    const stray = (n: number) =>
      page.evaluate(
        ([n, x, y]) => {
          const pointerId = (window as unknown as { __pid: number }).__pid;
          const grab = document.querySelector(".ss-grab")!;
          for (let i = 0; i < n; i++) grab.dispatchEvent(new PointerEvent("pointermove", { pointerId, pointerType: "mouse", isPrimary: true, buttons: 0, clientX: x, clientY: y, bubbles: true }));
        },
        [n, centre.x - 20, centre.y + 30],
      );
    const pullWith = async (n: number) => {
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.down();
      await page.mouse.move(centre.x - 20, centre.y + 30, { steps: 4 });
      await stray(n);
      await page.mouse.move(centre.x - 60, centre.y + 90, { steps: 6 });
      await page.mouse.up();
    };
    await pullWith(2);
    expect(await countText(page)).toBe("Китов запущено: 0");
    await page.waitForTimeout(500);
    await pullWith(1);
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
