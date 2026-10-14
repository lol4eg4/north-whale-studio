// The finale (T§5): the whale in a slingshot. Pull it back, aim at the studio name in the top
// bar and let go; it flies over the page and knocks pieces off their places.
//
//   section#finale  copy | canvas (ground, sling, whale at home) | grab button | hint | plan B | count
//   canvas.ss-sky   fixed over the viewport while the whale flies (fly / rocket) and confetti lasts
//
//   wait -> drop -> rest <-> drag -> fly ----> gone -> wait      (left the screen)
//                                    |  \---> roll -> gone      (rests on the ground 2.5 s)
//                                    \-> rocket -> top -> wait  (page follows it up; not in calm)
import type { Host } from "../../platform/host.ts";
import { binder } from "../../platform/text-binder.ts";
import { h, icon, toast } from "../../platform/ui/parts.ts";
import type { ContentApi } from "../content/api.ts";
import type { SoundApi } from "../sound/api.ts";
import { createBits } from "./bits.ts";
import {
  REST_TILT,
  camera,
  circleHitsBox,
  clamp,
  clampPull,
  fall,
  gravity,
  isBank,
  isRocket,
  keyPull,
  launch,
  layout,
  maxSpeed,
  pointsFor,
  quickPull,
  smoothstep,
  spring,
  type Box,
  type Geometry,
  type Shot,
  type Vec,
} from "./physics.ts";
import "./style.css";

type Mode = "wait" | "drop" | "rest" | "drag" | "fly" | "rocket" | "top" | "roll" | "gone";
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
// An angle folded into -pi..pi.
const wrapAngle = (a: number) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

export default function init(host: Host) {
  const { motion, memory } = host;
  const content = () => host.use<ContentApi>("content");
  const sound = () => host.use<SoundApi>("sound");
  const section = host.region("finale");

  // Markup
  const kicker = h("span", { class: "ss-kicker mono" });
  const titleText = h("span", {});
  const stk = h("span", { class: "ss-stk" });
  const h2 = h("h2", { id: "finale-title" }, titleText, " ", stk);
  const sub = h("p", { class: "ss-sub" });
  const outText = h("span");
  const out = h("a", { class: "link-under ss-out arrowed", href: "#contacts" }, outText, icon("arrowRight", 18));
  const copy = h("div", { class: "ss-copy" }, kicker, h2, sub, out);
  const canvas = h("canvas", { class: "ss-canvas", "aria-hidden": "true" });
  const grab = h("button", { type: "button", class: "ss-grab" });
  const hint = h("span", { class: "ss-hint mono", "aria-hidden": "true" });
  const caption = h("span", { class: "ss-cap" });
  const snap = h(
    "button",
    { type: "button", class: "ss-snap" },
    h("span", { class: "ss-pic" }, h("img", { src: "/whale.svg", alt: "", width: 130, height: 90, loading: "lazy" })),
    caption,
  );
  const count = h("p", { class: "ss-count mono" });
  const live = h("p", { class: "sr-only", "aria-live": "polite" });
  section.setAttribute("aria-labelledby", "finale-title");
  section.append(canvas, copy, snap, hint, grab, count, live);
  for (const el of [kicker, stk, snap]) motion.add(el, { kind: "sticker" });
  snap.addEventListener("click", () => sound().song());

  const sky = h("canvas", { class: "ss-sky", "aria-hidden": "true", hidden: true });
  host.region("overlay").append(sky);
  const ctx = canvas.getContext("2d")!;
  const skyCtx = sky.getContext("2d")!;

  const img = new Image();
  img.onload = () => wake();
  img.src = "/whale.svg";

  // Words
  let t: ReturnType<typeof binder> | null = null;
  let launches = 0;
  let score = 0;
  let best = Number(memory.get("best")) || 0;
  const showCount = () => (count.textContent = content().format("finale.count", { n: launches }));
  const showHint = () => (hint.textContent = content().text(grab.matches(":focus-visible") ? "finale.hintKeys" : "finale.hintFine"));
  host.ready(() => {
    t = binder(content().text);
    t.bind(kicker, "finale.kicker");
    t.bind(titleText, "finale.title");
    t.bind(stk, "finale.sticker");
    t.bind(sub, "finale.sub");
    t.bind(outText, "finale.out");
    t.bind(caption, "finale.planB");
    t.bind(grab, "finale.sling", "aria-label");
    t.bind(grab, "cursor.pull", "data-cursor");
    t.bind(snap, "cursor.play", "data-cursor");
    t.bind(out, "cursor.write", "data-cursor");
    t.bind(kicker, "cursor.drag", "data-cursor");
    t.bind(stk, "cursor.drag", "data-cursor");
    showCount();
    showHint();
  });
  host.on("language-changed", () => {
    t?.refresh();
    showCount();
    showHint();
  });

  // State
  let geo: Geometry = layout(1000, 700, 64, 0, 0);
  let mode: Mode = "wait";
  const pocket = { x: geo.R.x, y: geo.R.y, vx: 0, vy: 0 };
  const whale = { x: 0, y: 0, vx: 0, vy: 0, rot: REST_TILT, spin: 0, sq: 0, sqv: 0, st: 0, stA: 0 };
  const fr = { sq: 0, sqv: 0, lean: 0, leanv: 0 };
  let pull: Vec = { x: 0, y: 0 };
  let keyboard = false;
  let pointerId = -1;
  let grabOff: Vec = { x: 0, y: 0 };
  let timer = 0;
  let flyT = 0;
  let restT = 0;
  let g = gravity(innerHeight);
  let vmax = 1;
  let bank = false;
  let onScreen = false;
  let secRect = section.getBoundingClientRect();
  const hits = new Set<number>();
  const rk = { t: 0, cruise: 0, lift: 0, ramp: 1, cam: 0, camV: 0, free: false };
  let back: { from: number; to: number; t: number; dur: number } | null = null;
  let col = { frame: "", band: "", pocket: "", ground: "", lemon: "", buoy: "", bits: [] as string[] };
  const home = createBits(() => col.bits); // section coordinates
  const air = createBits(() => col.bits); // viewport coordinates

  const readColors = () => {
    const s = getComputedStyle(section);
    const v = (name: string) => s.getPropertyValue(name).trim();
    col = {
      frame: v("--ss-frame"),
      band: v("--ss-band"),
      pocket: v("--ss-pocket"),
      ground: v("--ss-ground"),
      lemon: v("--lemon"),
      buoy: v("--buoy"),
      bits: ["--cobalt", "--buoy", "--jellyfish", "--mint", "--lemon"].map(v),
    };
  };

  // The grab is a plain box round the whole whale (tilted in the sling) and a margin, so a press
  // on its nose or tail reaches it too.
  const grabW = () => geo.whaleW * 1.25 + 24;
  const grabH = () => geo.whaleH * 1.45 + 24;
  // Layout: the sling follows the section's size and the copy's height.
  function measure() {
    const W = section.clientWidth;
    const H = section.clientHeight;
    if (!W || !H) return;
    const floor = innerWidth <= 700 ? 140 : 64;
    const copyBottom = copy.offsetTop + copy.offsetHeight;
    const copyRight = copy.offsetLeft + Math.max(h2.offsetWidth, sub.offsetWidth);
    geo = layout(W, H, floor, copyBottom, copyRight);
    readColors();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mode !== "drag") {
      pocket.x = geo.R.x;
      pocket.y = geo.R.y;
    }
    if (mode === "rest" || mode === "drag") {
      whale.x = pocket.x;
      whale.y = pocket.y;
    }
    grab.style.width = `${grabW()}px`;
    // The focus ring keeps to the whale's body, at the foot of the grab (which grows upward while the whale drops in).
    grab.style.setProperty("--ring-w", `${geo.whaleW * 0.9}px`);
    grab.style.setProperty("--ring-h", `${geo.whaleH * 1.25}px`);
    grab.style.setProperty("--ring-b", `${(grabH() - geo.whaleH * 1.25) / 2}px`);
    placeAside(copyBottom);
    draw();
    wake();
  }

  function placeAside(copyBottom: number) {
    const { S, R, side, W, ground } = geo;
    const edge = copy.offsetLeft;
    const hw = hint.offsetWidth;
    const hh = hint.offsetHeight;
    if (side) {
      hint.style.left = `${Math.min(R.x - S * 0.18, W - hw - edge)}px`;
      hint.style.top = `${R.y - S * 1.2 - hh}px`;
    } else {
      hint.style.left = `${edge}px`;
      hint.style.top = `${Math.max(copyBottom + 12, R.y - S * 1.9 - hh)}px`;
    }
    const sw = snap.offsetWidth;
    const sh = snap.offsetHeight;
    snap.style.left = `${side ? R.x - S * 1.3 - sw : W - edge - sw}px`;
    snap.style.top = `${ground - (side ? 46 : 50) - sh}px`;
  }

  // Loop: runs while something moves and sleeps otherwise.
  let raf = 0;
  let last = 0;
  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function frame(now: number) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    secRect = section.getBoundingClientRect();
    step(dt / 2);
    step(dt / 2);
    if (mode === "rocket" && !rk.free) window.scrollTo({ top: rk.cam, behavior: "instant" });
    if (back) backStep(dt);
    if (mode === "fly" || mode === "rocket") collide();
    if (mode === "rocket" && !motion.calm && Math.random() < 0.7) {
      const y = whale.y - scrollY;
      air.burst(whale.x, y, 1, whale.vx, whale.vy, 0.4, 1);
    }
    draw();
    drawSky();
    placeGrab();
    if (!still()) raf = requestAnimationFrame(frame);
  }

  // The whale drops in as soon as the tips of the sling come on screen.
  const slingVisible = () => {
    const r = section.getBoundingClientRect();
    return r.bottom > 0 && r.top + geo.R.y - geo.S * 0.61 < innerHeight;
  };
  const settled = () =>
    Math.abs(pocket.x - geo.R.x) + Math.abs(pocket.y - geo.R.y) + Math.abs(pocket.vx) + Math.abs(pocket.vy) < 0.05 &&
    Math.abs(fr.sq) + Math.abs(fr.sqv) + Math.abs(fr.lean) + Math.abs(fr.leanv) + Math.abs(whale.sq) + Math.abs(whale.sqv) < 0.005 &&
    Math.abs(whale.rot - REST_TILT) < 0.002;
  function still() {
    if (back || air.count) return false;
    if (mode === "wait") return !slingVisible();
    if (mode !== "rest") return false;
    return !onScreen || (home.count === 0 && settled());
  }

  function step(dt: number) {
    const { R } = geo;
    const calm = motion.calm;
    if (mode !== "drag") {
      if (calm) {
        pocket.x = R.x;
        pocket.y = R.y;
        pocket.vx = pocket.vy = 0;
      } else {
        [pocket.x, pocket.vx] = spring(pocket.x, pocket.vx, R.x, 300, 7, dt);
        [pocket.y, pocket.vy] = spring(pocket.y, pocket.vy, R.y, 300, 7, dt);
      }
    }
    if (calm) fr.sq = fr.sqv = fr.lean = fr.leanv = whale.sq = whale.sqv = whale.st = 0;
    else {
      [fr.sq, fr.sqv] = spring(fr.sq, fr.sqv, 0, 380, 9, dt);
      [fr.lean, fr.leanv] = spring(fr.lean, fr.leanv, 0, 300, 8, dt);
      [whale.sq, whale.sqv] = spring(whale.sq, whale.sqv, 0, 420, 11, dt);
      fr.sq = clamp(fr.sq, -0.3, 0.3);
      fr.lean = clamp(fr.lean, -0.25, 0.25);
      whale.sq = clamp(whale.sq, -0.4, 0.4);
    }
    switch (mode) {
      case "wait":
        if (slingVisible()) drop();
        break;
      case "drop":
        whale.vy += g * 1.3 * dt;
        whale.y += whale.vy * dt;
        whale.x = pocket.x;
        if (whale.y >= pocket.y) land();
        break;
      case "rest":
        whale.x = pocket.x;
        whale.y = pocket.y;
        whale.rot += (REST_TILT - whale.rot) * Math.min(1, dt * 8);
        stretch(0, 0, dt);
        break;
      case "drag": {
        whale.x = pocket.x;
        whale.y = pocket.y;
        const len = Math.hypot(pull.x, pull.y);
        stretch(calm ? 0 : (0.28 * len) / geo.maxPull, Math.atan2(pull.y, pull.x), dt);
        break;
      }
      case "fly":
        fly(dt);
        break;
      case "rocket":
        rocket(dt);
        break;
      case "roll":
        roll(dt);
        break;
      case "top":
      case "gone":
        timer -= dt;
        if (timer <= 0) comeBack();
        break;
    }
    home.step(dt, g);
    air.step(dt, g);
  }

  function stretch(target: number, angle: number, dt: number) {
    whale.st += (target - whale.st) * Math.min(1, dt * 14);
    whale.stA = angle;
  }

  function drop() {
    if (motion.calm) {
      whale.x = pocket.x;
      whale.y = pocket.y;
      whale.rot = REST_TILT;
      mode = "rest";
      return;
    }
    whale.x = pocket.x;
    whale.y = -geo.whaleH;
    whale.vy = 0;
    whale.rot = REST_TILT;
    mode = "drop";
  }

  function land() {
    const hit = whale.vy;
    whale.y = pocket.y;
    whale.vy = 0;
    mode = "rest";
    pocket.vy += hit * 0.42;
    whale.sqv += clamp(hit / 900, 0, 2) * 4.5;
    home.burst(pocket.x, pocket.y, 8, 0, 1);
    sound().play("boing");
  }

  // Input: pointer on the whale, or keys on the focused sling. A press on the whale while it
  // drops in or lies on the ground, or on the empty sling after it popped, catches it: it is in
  // the pocket at once and the pull starts.
  let upMoves = 0;
  grab.addEventListener("pointerdown", (e) => {
    if (!["rest", "drop", "roll", "gone"].includes(mode) || e.button !== 0) return;
    e.preventDefault();
    grab.setPointerCapture(e.pointerId);
    if (mode === "roll" || mode === "gone") drop();
    if (mode === "drop") land();
    pointerId = e.pointerId;
    upMoves = 0;
    keyboard = false;
    const r = section.getBoundingClientRect();
    grabOff = { x: pocket.x - (e.clientX - r.left), y: pocket.y - (e.clientY - r.top) };
    pull = { x: pocket.x - geo.R.x, y: pocket.y - geo.R.y };
    mode = "drag";
    sound().play("peel", clamp(e.clientX / innerWidth, 0, 1));
    wake();
  });
  grab.addEventListener("pointermove", (e) => {
    if (mode !== "drag" || keyboard || e.pointerId !== pointerId) return;
    // The button came up where we did not hear it (a Mac ctrl-click menu): put the whale back.
    // Only on the second such move in a row: one odd move from a trackpad never drops a real pull.
    if (e.pointerType === "mouse" && e.buttons === 0) {
      if (++upMoves < 2) return;
      pointerId = -1;
      return cancelAim();
    }
    upMoves = 0;
    const r = section.getBoundingClientRect();
    setPull(e.clientX - r.left + grabOff.x - geo.R.x, e.clientY - r.top + grabOff.y - geo.R.y);
  });
  grab.addEventListener("pointerup", (e) => {
    if (mode !== "drag" || keyboard || e.pointerId !== pointerId) return;
    pointerId = -1;
    release();
  });
  grab.addEventListener("contextmenu", (e) => e.preventDefault());
  grab.addEventListener("pointercancel", () => {
    if (mode === "drag" && !keyboard) mode = "rest";
    pointerId = -1;
  });
  grab.addEventListener("keydown", (e) => {
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      if (mode === "rest") {
        mode = "drag";
        keyboard = true;
        pull = { x: 0, y: 0 };
      }
      if (mode !== "drag" || !keyboard) return;
      const p = keyPull(pull, e.key, geo.maxPull);
      if (p) setPull(p.x, p.y);
      wake();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (mode === "rest") {
        pull = quickPull(geo.maxPull, Math.random(), Math.random());
        release();
      } else if (mode === "drag" && keyboard) release();
    } else if (e.key === "Escape" && mode === "drag" && keyboard) {
      e.preventDefault();
      cancelAim();
    }
  });
  grab.addEventListener("keyup", (e) => e.key === " " && e.preventDefault());
  grab.addEventListener("focus", showHint);
  grab.addEventListener("blur", () => {
    if (mode === "drag" && keyboard) cancelAim();
    showHint();
  });

  function cancelAim() {
    mode = "rest";
    keyboard = false;
    wake();
  }
  function setPull(dx: number, dy: number) {
    pull = clampPull(dx, dy, geo.maxPull);
    pocket.x = geo.R.x + pull.x;
    pocket.y = geo.R.y + pull.y;
    pocket.vx = pocket.vy = 0;
    whale.rot = REST_TILT + clamp(pull.x * 0.004, -0.4, 0.4);
    wake();
  }

  function release() {
    keyboard = false;
    secRect = section.getBoundingClientRect();
    g = gravity(innerHeight);
    vmax = maxSpeed(g, secRect.top + geo.R.y, geo.whaleH, innerHeight);
    const shot = launch(pull, geo.maxPull, vmax);
    if (!shot) {
      mode = "rest";
      wake();
      return;
    }
    fire(shot);
  }

  function fire(shot: Shot) {
    const calm = motion.calm;
    launches++;
    showCount();
    live.textContent = count.textContent;
    section.classList.add("ss-launched");
    host.emit("whale-launched", { power: shot.power });

    const start = { x: secRect.left + pocket.x, y: secRect.top + pocket.y };
    Object.assign(whale, { x: start.x, y: start.y, vx: shot.vx, vy: shot.vy });
    whale.spin = calm ? 0 : Math.sign(shot.ux || 1) * (3 + Math.random() * 5);
    pocket.vx = shot.vx * 0.32;
    pocket.vy = shot.vy * 0.32;
    if (!calm) {
      fr.sqv += 7 * shot.power;
      fr.leanv += -shot.ux * 3.2 * shot.power;
      home.burst(pocket.x, pocket.y, 16, shot.ux, shot.uy);
      for (const el of [h2, count])
        el.animate([{ scale: "1" }, { scale: "1.12 .9", offset: 0.25 }, { scale: ".96 1.05", offset: 0.55 }, { scale: "1" }], {
          duration: 600,
          easing: "cubic-bezier(.3,1.7,.5,1)",
        });
    }
    hits.clear();
    flyT = 0;
    bank = !calm && isBank(shot.ux, shot.uy, shot.power);
    if (!calm && isRocket(shot.ux, shot.uy, shot.power)) startRocket();
    else mode = "fly";
    wake();
  }

  // Free flight over the viewport.
  function fly(dt: number) {
    flyT += dt;
    const prevY = whale.y;
    fall(whale, g, dt);
    whale.rot += whale.spin * dt;
    const speed = Math.hypot(whale.vx, whale.vy);
    stretch(motion.calm ? 0 : clamp((speed / vmax) * 0.34, 0, 0.34) * Math.max(0, 1 - flyT * 0.9), Math.atan2(whale.vy, whale.vx), dt);

    // Coming down onto the finale's ground: it stays there with the page.
    const foot = geo.rad * 0.7;
    const groundY = secRect.top + geo.ground;
    if (whale.vy > 0 && whale.y + foot >= groundY && prevY + foot <= groundY + 1 && whale.x > secRect.left && whale.x < secRect.right) {
      if (motion.calm) return pop(whale.x, groundY);
      whale.x -= secRect.left;
      whale.y = geo.ground - foot;
      whale.vy = -whale.vy * 0.4;
      whale.vx *= 0.7;
      restT = 0;
      mode = "roll";
      return;
    }
    const vw = innerWidth;
    const vh = innerHeight;
    const m = geo.whaleW * 0.5;
    const side = whale.x < 0 ? -1 : whale.x > vw ? 1 : 0;
    if (side && bank) return bankOff(side);
    if (whale.x < -m || whale.x > vw + m || whale.y < -m || whale.y > vh + m || (motion.calm && flyT > 1.6))
      pop(clamp(whale.x, 24, vw - 24), clamp(whale.y, 24, vh - 24));
  }

  function bankOff(side: number) {
    whale.x = side < 0 ? geo.rad : innerWidth - geo.rad;
    whale.vx = -whale.vx * 0.35;
    whale.vy = -Math.max(Math.abs(whale.vy), vmax * 0.9);
    whale.spin = -whale.spin * 1.3;
    air.ring(whale.x, whale.y, geo.whaleW * 0.1, 2.1, col.buoy, geo.whaleW * 5);
    air.burst(whale.x, whale.y, 14, side, 0);
    shake(sky);
    sound().play("hit", 0);
    startRocket();
  }

  // The rocket (T§5.7): the whale cruises up the page and the page follows it.
  function startRocket() {
    mode = "rocket";
    whale.vx *= 0.6;
    whale.y += scrollY;
    const vh = innerHeight;
    rk.cruise = -Math.min(2 * vh, Math.max(900, whale.y / 5.5));
    rk.lift = -Math.min(650, 0.5 * Math.abs(rk.cruise));
    rk.t = 0;
    rk.cam = scrollY;
    rk.camV = 0;
    rk.free = false;
    rk.ramp = 0.8 * clamp((whale.y - scrollY) / (0.6 * vh), 0.45, 1);
    watchVisitor(true);
  }

  function rocket(dt: number) {
    rk.t += dt;
    const want = rk.lift + (rk.cruise - rk.lift) * smoothstep((rk.t - 0.2) / 1.2);
    whale.vy += (want - whale.vy) * Math.min(1, dt * 5);
    whale.vx *= 0.6 ** dt;
    whale.x += whale.vx * dt;
    whale.y += whale.vy * dt;
    whale.rot += whale.spin * dt;
    stretch(0, 0, dt);
    const vw = innerWidth;
    if (whale.x < geo.rad) {
      whale.x = geo.rad;
      whale.vx = Math.abs(whale.vx);
    } else if (whale.x > vw - geo.rad) {
      whale.x = vw - geo.rad;
      whale.vx = -Math.abs(whale.vx);
    }
    if (!rk.free) [rk.cam, rk.camV] = camera(rk.cam, rk.camV, whale.y, whale.vy, rk.t, rk.ramp, innerHeight, dt);
    if (whale.y < 50) reachTop();
    else if (rk.free && whale.y - scrollY < -geo.whaleW * 0.5) pop(whale.x, 24);
  }

  function reachTop() {
    const y = whale.y - scrollY;
    mode = "top";
    timer = 1.1;
    boom(whale.x, y, 0, -1);
  }

  // Resting on the finale's ground (section coordinates) until it pops home after 2.5 s.
  function roll(dt: number) {
    const foot = geo.rad * 0.7;
    const floorY = geo.ground - foot;
    whale.vy += g * dt;
    whale.x += whale.vx * dt;
    whale.y += whale.vy * dt;
    if (whale.y >= floorY) {
      whale.y = floorY;
      if (whale.vy > 90) {
        whale.vy = -whale.vy * 0.4;
        whale.vx *= 0.7;
        whale.spin *= 0.5;
      } else whale.vy = 0;
    }
    const onFloor = whale.y >= floorY - 0.5 && whale.vy === 0;
    if (onFloor) {
      whale.vx *= 0.1 ** dt;
      whale.rot -= wrapAngle(whale.rot) * Math.min(1, dt * 6); // settle the right way up
    } else whale.rot += whale.spin * dt;
    if (whale.x < geo.rad) {
      whale.x = geo.rad;
      whale.vx = Math.abs(whale.vx) * 0.5;
    } else if (whale.x > geo.W - geo.rad) {
      whale.x = geo.W - geo.rad;
      whale.vx = -Math.abs(whale.vx) * 0.5;
    }
    restT = onFloor && Math.abs(whale.vx) < 20 ? restT + dt : 0;
    if (restT >= 2.5) pop(secRect.left + whale.x, secRect.top + whale.y);
  }

  function pop(x: number, y: number) {
    boom(x, y, x - innerWidth / 2, y - innerHeight / 2);
    mode = "gone";
    timer = 0.8;
  }

  function boom(x: number, y: number, ux: number, uy: number) {
    sound().play("pop");
    if (motion.calm) return;
    const len = Math.hypot(ux, uy) || 1;
    air.burst(x, y, 36, ux / len, uy / len, 2.3, 3.4);
    air.ring(x, y, geo.whaleW * 0.12, 2.1, col.buoy, geo.whaleW * 5);
    air.ring(x, y, geo.whaleW * 0.04, 1.5, col.buoy, geo.whaleW * 3);
    air.star(x, y, geo.whaleW * 0.32, 1.7, col.lemon);
    shake(sky);
  }

  // Home again: after a rocket the page scrolls back down to the sling, unless the visitor
  // has taken over the scroll.
  function comeBack() {
    if (mode === "top" && !rk.free) scrollBack();
    else if (!back) watchVisitor(false);
    mode = "wait";
  }

  function scrollBack() {
    const r = section.getBoundingClientRect();
    const max = document.documentElement.scrollHeight - innerHeight;
    const to = clamp(scrollY + r.bottom - innerHeight, 0, max);
    const dist = Math.abs(to - scrollY);
    if (dist < 2) return watchVisitor(false);
    back = { from: scrollY, to, t: 0, dur: clamp(dist / 2500, 0.9, 2.4) };
  }
  function backStep(dt: number) {
    if (!back) return;
    back.t += dt;
    const k = smoothstep(back.t / back.dur);
    window.scrollTo({ top: back.from + (back.to - back.from) * k, behavior: "instant" });
    if (back.t >= back.dur) {
      back = null;
      watchVisitor(false);
    }
  }

  // The visitor takes over the scroll: the page stops following the whale.
  const takeOver = () => {
    rk.free = true;
    back = null;
    watchVisitor(false);
  };
  const onKey = (e: KeyboardEvent) => e.target !== grab && SCROLL_KEYS.has(e.key) && takeOver();
  let watching = false;
  function watchVisitor(on: boolean) {
    if (on === watching) return;
    watching = on;
    for (const type of ["wheel", "touchmove", "pointerdown"] as const) {
      if (on) window.addEventListener(type, takeOver, { passive: true });
      else window.removeEventListener(type, takeOver);
    }
    if (on) window.addEventListener("keydown", onKey);
    else window.removeEventListener("keydown", onKey);
  }

  // Hits: every piece the whale touches is knocked away; the studio name scores.
  function collide() {
    const wx = whale.x;
    const wy = mode === "rocket" ? whale.y - scrollY : whale.y;
    const r = geo.rad;
    for (const id of motion.ids()) {
      if (hits.has(id)) continue;
      const el = motion.el(id);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !circleHitsBox(wx, wy, r, b)) continue;
      const info = motion.info(id);
      if (info?.kind === "dock" || el.closest("dialog[open], .dock, .ctrl")) continue;
      hits.add(id);
      const points = pointsFor(info);
      if (points) bullseye(el, b, points);
      else knock(id, b, wx, wy);
      host.emit("whale-hit", { piece: id, points });
      if (points && mode === "rocket") {
        reachTop();
        return;
      }
    }
  }

  function knock(id: number, b: Box, wx: number, wy: number) {
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    const dx = cx - wx;
    const dy = cy - wy;
    const d = Math.hypot(dx, dy) || 1;
    const s = 450 + Math.random() * 450;
    // Small stickers tumble, long lines of text only tilt.
    const size = clamp(200 / Math.max(b.right - b.left, b.bottom - b.top), 0.25, 1.5);
    const spin = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 35) * size;
    motion.fling(id, (dx / d) * s + whale.vx * 0.25, (dy / d) * s + whale.vy * 0.15 - 120, spin);
    if (!motion.calm) air.burst(cx, cy, 10, -dx / d, -dy / d, 1.6);
  }

  let scoreEl: HTMLElement | null = null;
  let scoreTimer = 0;
  let flashEl: HTMLElement | null = null;
  function bullseye(el: HTMLElement, b: Box, points: number) {
    score += points;
    if (score > best) {
      best = score;
      memory.set("best", String(best));
    }
    showScore();
    toast(content().format("finale.hit", { n: points }));
    if (motion.calm) return;
    flashEl ??= host.region("overlay").appendChild(h("div", { class: "ss-flash", "aria-hidden": "true" }));
    flashEl.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.15 }, { opacity: 0 }], { duration: 450, easing: "ease-out" });
    el.animate(
      [{ transform: "rotate(0deg) scale(1)" }, { transform: "rotate(540deg) scale(1.9)", offset: 0.45 }, { transform: "rotate(720deg) scale(1)" }],
      { duration: 1500, easing: "cubic-bezier(.3,1.2,.4,1)" },
    );
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    air.burst(cx, cy, 70, 0, -1, 3, 6.2);
    air.star(cx, cy, geo.whaleW * 0.4, 1.4, col.lemon);
  }

  function showScore() {
    if (!scoreEl) {
      scoreEl = h(
        "div",
        { class: "ss-score", "aria-hidden": "true" },
        h("span", { class: "mono-s" }),
        h("b", {}),
        h("span", { class: "mono-s ss-best" }),
      );
      host.region("overlay").append(scoreEl);
    }
    const [label, num, bestEl] = scoreEl.children;
    label.textContent = content().text("finale.score");
    num.textContent = String(score);
    bestEl.textContent = content().format("finale.best", { n: best });
    scoreEl.classList.remove("out");
    if (!motion.calm) scoreEl.animate([{ scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1 }], { duration: 520, easing: motion.spring.easing });
    clearTimeout(scoreTimer);
    scoreTimer = window.setTimeout(() => scoreEl!.classList.add("out"), 5000);
  }

  function shake(el: HTMLElement) {
    if (motion.calm) return;
    el.animate(
      [
        { translate: "0 0" },
        { translate: "-5px 2px", offset: 0.15 },
        { translate: "4px -2px", offset: 0.35 },
        { translate: "-2px 1px", offset: 0.55 },
        { translate: "1px -1px", offset: 0.75 },
        { translate: "0 0" },
      ],
      { duration: 420, easing: "ease-out" },
    );
  }

  // Drawing (T§5.5): ground, back band, fork, pocket, whale, front band, confetti.
  function draw() {
    if (!onScreen) return;
    const { W, H, S, R, ground } = geo;
    const c = ctx;
    c.clearRect(0, 0, W, H);
    c.fillStyle = col.ground;
    c.fillRect(0, ground, W, H - ground);
    const base = { x: R.x, y: R.y + S * 1.35 };
    const cos = Math.cos(fr.lean);
    const sin = Math.sin(fr.lean);
    const fx = (x: number, y: number): Vec => {
      const dx = (x - base.x) * (1 + 0.45 * fr.sq);
      const dy = (y - base.y) * (1 - fr.sq);
      return { x: base.x + dx * cos - dy * sin, y: base.y + dx * sin + dy * cos };
    };
    const tipL = fx(R.x - 0.4 * S, R.y - 0.61 * S);
    const tipR = fx(R.x + 0.4 * S, R.y - 0.61 * S);
    const joint = fx(R.x, R.y + 0.38 * S);
    c.strokeStyle = col.frame;
    c.lineWidth = S * 0.13;
    c.lineCap = "butt"; // the stem stands on the ground
    c.beginPath();
    c.moveTo(base.x, base.y);
    c.lineTo(joint.x, joint.y);
    c.stroke();
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(tipL.x, tipL.y);
    c.lineTo(joint.x, joint.y);
    c.lineTo(tipR.x, tipR.y);
    c.stroke();
    band(c, tipL);
    band(c, tipR);
    c.fillStyle = col.pocket;
    c.beginPath();
    c.ellipse(pocket.x, pocket.y, S * 0.18, S * 0.08, 0, 0, Math.PI * 2);
    c.fill();
    if (mode === "rest" || mode === "drag" || mode === "drop" || mode === "roll") drawWhale(c, whale.x, whale.y);
    home.draw(c);
  }

  function band(c: CanvasRenderingContext2D, tip: Vec) {
    const len = Math.hypot(pocket.x - tip.x, pocket.y - tip.y);
    c.strokeStyle = col.band;
    c.lineCap = "round";
    c.lineWidth = geo.S * 0.075 * clamp(1.15 - len / (geo.maxPull * 2.4), 0.45, 1);
    c.beginPath();
    c.moveTo(tip.x, tip.y);
    c.lineTo(pocket.x, pocket.y);
    c.stroke();
  }

  function drawWhale(c: CanvasRenderingContext2D, x: number, y: number) {
    if (!img.naturalWidth) return;
    const { whaleW: w, whaleH: wh, S } = geo;
    c.save();
    c.translate(x, y);
    if (whale.st) {
      c.rotate(whale.stA);
      c.scale(1 + whale.st, 1 / (1 + whale.st));
      c.rotate(-whale.stA);
    }
    c.rotate(whale.rot);
    if (whale.sq) c.scale(1 + whale.sq, 1 - 0.9 * whale.sq);
    c.shadowColor = "rgba(14,14,14,.3)";
    c.shadowBlur = 10;
    c.shadowOffsetY = 6;
    c.drawImage(img, -w / 2, -wh / 2 - S * 0.14, w, wh);
    c.restore();
  }

  function sizeSky() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    sky.width = Math.round(innerWidth * dpr);
    sky.height = Math.round(innerHeight * dpr);
    skyCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function drawSky() {
    const flying = mode === "fly" || mode === "rocket";
    if (!flying && !air.count) {
      if (!sky.hidden) {
        skyCtx.clearRect(0, 0, innerWidth, innerHeight);
        sky.hidden = true;
      }
      return;
    }
    if (sky.hidden) {
      sky.hidden = false;
      sizeSky();
    }
    skyCtx.clearRect(0, 0, innerWidth, innerHeight);
    if (flying) drawWhale(skyCtx, whale.x, mode === "rocket" ? whale.y - scrollY : whale.y);
    air.draw(skyCtx);
  }

  function placeGrab() {
    const at = mode === "rest" || mode === "drag" || mode === "roll" ? whale : geo.R;
    const w = grabW();
    const gh = grabH();
    // While the whale drops in, the grab also reaches up over it and the last 0.2 s of its fall
    // (the eye and the finger lag behind it).
    const up = mode === "drop" ? clamp(geo.R.y - whale.y + whale.vy * 0.2, 0, geo.H) : 0;
    grab.style.height = `${gh + up}px`;
    grab.style.translate = `${at.x - w / 2}px ${at.y - up - geo.S * 0.14 - gh / 2}px`;
  }

  // Watchers
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen) {
      draw();
      wake();
    }
  }).observe(section);
  const ro = new ResizeObserver(measure);
  ro.observe(section);
  ro.observe(copy);
  document.fonts?.ready.then(measure, () => {});
  window.addEventListener("scroll", () => mode === "wait" && wake(), { passive: true });
  window.addEventListener("resize", () => !sky.hidden && sizeSky());
}
