// Dive and tidy: the dock in the bottom-right corner (T§2.9) and the dive block on the wall.
//
//   «Ныряй наугад»  pick a case (never the last one) -> tidy -> shuffle the wall with the target
//                   between two cases -> scroll to it -> spotlight roulette (desktop) or slot
//                   reel in the tile (phone) -> open the case. Calm: open a random case at once.
//   «Прибраться»    every moved piece home, the wall back in its order, toast with the count.
import type { Host } from "../../platform/host.ts";
import { binder } from "../../platform/text-binder.ts";
import { h, icon, toast } from "../../platform/ui/parts.ts";
import type { CaseApi } from "../case/api.ts";
import type { CaseItem, ContentApi } from "../content/api.ts";
import { arrangeDense, frameScroll, pickCase, ROULETTE_STEPS, rouletteStart, rouletteTimes, type Span } from "./plan.ts";
import { drawRing } from "./ring.ts";
import "./style.css";

// The reference waits 1150 ms for the shuffle and 620 ms after the landing; the brief wants a
// case open within 3 s, so the roulette starts 250 ms into the shuffle (the cells are nearly
// there; it measures their final places, not where they fly) and the landing holds 100 ms.
// The roulette keeps its 16 steps and 2700 ms weights, on a schedule fixed from its start, so
// a busy frame never makes the roll longer.
const SETTLE_MS = 250;
const LAND_MS = 100;

export default function init(host: Host) {
  const motion = host.motion;
  const content = host.use<ContentApi>("content");
  const t = binder(content.text);
  const root = document.documentElement;
  const phone = matchMedia("(max-width: 700px)");
  const tablet = matchMedia("(max-width: 1100px)");

  // ---- Dock: round dive button with the ring, tidy pill with the mess badge, speech bubble.
  const ring = h("canvas", { class: "dive-ring", "aria-hidden": "true" });
  const coreTop = h("span");
  const coreBottom = h("span");
  const diveBtn = h("button", { type: "button", class: "dive-btn" }, ring, h("span", { class: "dive-core", "aria-hidden": "true" }, coreTop, coreBottom));
  t.bind(diveBtn, "dive.title", "aria-label");
  t.bind(diveBtn, "cursor.dive", "data-cursor");

  const badge = h("span", { class: "tidy-n", "aria-hidden": "true", hidden: true });
  const tidyBtn = h("button", { type: "button", class: "tidy-btn" }, h("span", { class: "tidy-ico" }, icon("broom", 20)), t.bind(h("span", { class: "tidy-t" }), "tidy.label"), badge);
  t.bind(tidyBtn, "tidy.label", "aria-label");
  t.bind(tidyBtn, "cursor.tidy", "data-cursor");

  const bubble = h("div", { class: "dive-bubble", "aria-hidden": "true", hidden: true });
  const dock = h("div", { class: "dive-dock" }, bubble, diveBtn, tidyBtn);
  host.region("corner-right").append(dock);
  motion.add(diveBtn, { kind: "dock" });
  motion.add(tidyBtn, { kind: "dock" });

  const live = h("div", { class: "sr-only", role: "status", "aria-live": "polite" });
  host.region("overlay").append(live);

  const showCore = () => {
    const [first, ...rest] = content.text("dive.title").split(" ");
    coreTop.textContent = first;
    coreBottom.textContent = rest.join(" ");
  };
  showCore();

  // Ring text: drawn once the mono font is there, again only for a new language or size.
  let fontsReady = false;
  const paintRing = () => {
    if (!fontsReady) return;
    const size = phone.matches ? 84 : tablet.matches ? 128 : 156;
    const ink = getComputedStyle(root).getPropertyValue("--ink").trim() || "#0E0E0E";
    drawRing(ring, content.text("dive.ring"), size, phone.matches ? 17 : 14.5, ink);
  };
  const fonts = document.fonts;
  Promise.all([fonts?.ready, fonts?.load('500 14.5px "JetBrains Mono"', content.text("dive.ring"))])
    .catch(() => undefined)
    .then(() => {
      fontsReady = true;
      paintRing();
    });
  phone.addEventListener("change", paintRing);
  tablet.addEventListener("change", paintRing);

  // ---- Mess badge: how many pieces are away from home.
  let shown = 0;
  const updateBadge = () => {
    const n = motion.moved().length;
    badge.hidden = n === 0;
    badge.textContent = String(n);
    tidyBtn.classList.toggle("messy", n > 0);
    if (n > shown && !motion.calm) badge.animate([{ scale: 1.6 }, { scale: 1 }], { duration: 450, easing: motion.spring.easing });
    shown = n;
  };
  const laterBadge = () => requestAnimationFrame(updateBadge);
  host.on("piece-dropped", laterBadge);
  host.on("whale-hit", laterBadge);

  // ---- Wall helpers (through Motion: the wall's cells and pieces, never its markup).
  const pieceIn = (cell: HTMLElement) => {
    const id = motion.idOf(cell.firstElementChild);
    return id === undefined ? undefined : { id, el: motion.el(id)!, info: motion.info(id)! };
  };
  const caseOf = (cell: HTMLElement) => {
    const p = pieceIn(cell);
    return p?.info.kind === "tile" ? p.info.tag : undefined;
  };
  const shownCell = (cell: HTMLElement) => getComputedStyle(cell).display !== "none";
  const caseCells = () => motion.cells("wall").filter((c) => caseOf(c) !== undefined && shownCell(c));
  // Layout box in viewport coordinates for a page scrolled to `at` (default: now), without the
  // FLIP transforms still running.
  const layoutBox = (el: HTMLElement, at = scrollY) => {
    let top = 0;
    let left = 0;
    for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
      top += n.offsetTop;
      left += n.offsetLeft;
    }
    return { top: top - at, bottom: top - at + el.offsetHeight, left: left - scrollX, width: el.offsetWidth, height: el.offsetHeight };
  };
  let landingScroll = 0;

  // The shuffle keeps the wall dense: the grid sizes of the cells (read once) let plan.ts pack
  // each candidate order like the browser would and keep one without holes.
  const shuffle = (cells: HTMLElement[], target: HTMLElement) => {
    const grid = cells[0]?.parentElement;
    const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length : 0;
    const spans = new Map(cells.map((c) => [c, spanOf(c, cols)]));
    const isCase = (c: HTMLElement) => caseOf(c) !== undefined && spans.get(c) !== null;
    return arrangeDense(cells, target, isCase, (c) => spans.get(c) ?? null, Math.max(1, cols), Math.random, cols > 1 ? 300 : 1);
  };
  const spanOf = (cell: HTMLElement, cols: number): Span | null => {
    const cs = getComputedStyle(cell);
    if (cs.display === "none") return null;
    const track = (start: string, end: string) => {
      const span = /span (\d+)/.exec(start) ?? /span (\d+)/.exec(end);
      if (span) return { n: Number(span[1]), full: false };
      const a = parseInt(start);
      const b = parseInt(end);
      if (a === 1 && b === -1) return { n: cols, full: true };
      return { n: b > a ? b - a : 1, full: false };
    };
    const col = track(cs.gridColumnStart, cs.gridColumnEnd);
    return { w: col.n, h: track(cs.gridRowStart, cs.gridRowEnd).n, full: col.full };
  };

  // ---- Waiting that Esc can cut short.
  let wakers: (() => void)[] = [];
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        wakers = wakers.filter((w) => w !== done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, ms));
      wakers.push(done);
    });

  let rolling = false;
  let cancelled = false;
  let caseOpen = false;
  let tidying = false;
  let last: number | undefined;

  const say = (text: string) => {
    bubble.textContent = text;
    bubble.hidden = !text;
  };
  const cancelRoll = () => {
    cancelled = true;
    for (const w of [...wakers]) w();
  };
  const pulse = (cell: HTMLElement) => {
    if (motion.calm) return;
    pieceIn(cell)?.el.animate([{ transform: "scale(1)" }, { transform: "scale(1.08) rotate(-1deg)" }, { transform: "scale(1)" }], {
      duration: 520,
      easing: "cubic-bezier(.3,1.6,.5,1)",
    });
  };

  async function dive(from: HTMLElement) {
    if (rolling || caseOpen || tidying) return;
    const ids = content.cases().map((c) => c.id);
    if (!ids.length) return;
    const target = pickCase(ids, last);
    last = target;
    const open = () => {
      const cell = motion.cells("wall").find((c) => caseOf(c) === target);
      live.textContent = content.format("dive.picked", { title: content.caseById(target)?.client ?? String(target) });
      host.use<CaseApi>("case").open(target, "dive", (cell && pieceIn(cell)?.el) || from);
    };
    if (motion.calm) return open();

    rolling = true;
    cancelled = false;
    root.classList.add("dive-rolling");
    say(content.text("dive.shuffling"));
    try {
      motion.tidy();
      updateBadge();
      const cell = motion.cells("wall").find((c) => caseOf(c) === target);
      if (cell) {
        void motion.reorder("wall", (cells) => shuffle(cells, cell), true);
        host.emit("wall-shuffled", {});
        const order = motion.cells("wall");
        const at = order.indexOf(cell);
        const group = [order[at - 1], cell, order[at + 1]].filter(Boolean).map(layoutBox);
        const box = layoutBox(cell);
        const y = frameScroll(box, { top: Math.min(...group.map((b) => b.top)), bottom: Math.max(...group.map((b) => b.bottom)) }, innerHeight, phone.matches);
        landingScroll = Math.max(0, Math.min(scrollY + y, root.scrollHeight - innerHeight));
        if (Math.abs(y) > 8) scrollTo({ top: landingScroll, behavior: "smooth" });
        await sleep(SETTLE_MS);
        if (cancelled) return;
        await (phone.matches ? slot(cell, target) : roulette(cell));
        if (cancelled) return;
        pulse(cell);
        await sleep(LAND_MS);
        if (cancelled) return;
      }
      endRoll();
      open();
    } finally {
      endRoll();
    }
  }
  function endRoll() {
    rolling = false;
    root.classList.remove("dive-rolling");
    say("");
    for (const c of motion.cells("wall")) c.classList.remove("dive-dim", "dive-lit");
  }

  // Desktop: a spotlight runs over the cases on screen, fast at first, and stops on the target.
  async function roulette(cell: HTMLElement) {
    const vh = innerHeight;
    const cands = caseCells()
      .map((c) => ({ c, b: layoutBox(c, landingScroll) }))
      .filter(({ b }) => {
        const height = b.bottom - b.top;
        return height > 0 && (Math.min(b.bottom, vh - 80) - Math.max(b.top, 90)) / height > 0.2;
      })
      .sort((p, q) => Math.round(p.b.top / 60) - Math.round(q.b.top / 60) || p.b.left - q.b.left)
      .map(({ c }) => c);
    if (!cands.includes(cell)) cands.push(cell);
    const steps = ROULETTE_STEPS;
    const start = rouletteStart(cands.length, cands.indexOf(cell));
    const times = rouletteTimes(steps);
    for (const c of motion.cells("wall")) c.classList.add("dive-dim");
    let lit: HTMLElement | undefined;
    let due = performance.now();
    for (let i = 0; i <= steps; i++) {
      if (cancelled) return;
      lit?.classList.remove("dive-lit");
      lit = cands[(i + start) % cands.length];
      lit.classList.add("dive-lit");
      if (i === steps) {
        say(content.text("dive.that"));
        break;
      }
      say(`${content.caseById(caseOf(lit)!)?.client ?? ""}?`);
      due += times[i];
      await sleep(due - performance.now());
    }
  }

  // Phone: the centred tile turns into a slot reel of other cases and lands on the target.
  async function slot(cell: HTMLElement, target: number) {
    const tile = pieceIn(cell)?.el;
    const picked = content.caseById(target);
    if (!tile || !picked) return;
    const r = layoutBox(tile, 0);
    const reel = h("div", { class: "dive-slot", "aria-hidden": "true" });
    reel.style.cssText = `left:${r.left + scrollX}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    host.region("overlay").append(reel);
    const others = content.cases().filter((c) => c.id !== target);
    const seq: CaseItem[] = [];
    for (let i = 0; i < 16 && others.length; i++) {
      let c = others[Math.floor(Math.random() * others.length)];
      if (others.length > 1) while (c.id === seq.at(-1)?.id) c = others[Math.floor(Math.random() * others.length)];
      seq.push(c);
    }
    seq.push(picked);
    for (const c of seq) new Image().src = c.media.posterPhone;
    const times = rouletteTimes(seq.length - 1);
    let prev: HTMLElement | undefined;
    let due = performance.now();
    try {
      for (let i = 0; i < seq.length; i++) {
        if (cancelled) return;
        const c = seq[i];
        const landing = i === seq.length - 1;
        const card = h(
          "div",
          { class: "dive-slot-card" },
          h("img", { src: c.media.posterPhone, alt: "" }),
          h("span", { class: "dive-slot-plate" }, h("span", { class: "mono" }, c.what ?? content.text("wall.watch")), h("b", {}, c.client)),
        );
        reel.append(card);
        const d = landing ? LAND_MS : Math.max(90, Math.min(260, times[i] * 0.85));
        card.animate([{ transform: "translateY(-100%)" }, { transform: "none" }], { duration: d, easing: landing ? "cubic-bezier(.3,1.5,.5,1)" : "linear" });
        if (prev) {
          const old = prev;
          old.animate([{ transform: "none" }, { transform: "translateY(100%)" }], { duration: d, easing: "linear", fill: "forwards" }).finished.then(
            () => old.remove(),
            () => old.remove(),
          );
        }
        prev = card;
        say(landing ? content.text("dive.that") : `${c.client}?`);
        due += landing ? d : times[i];
        await sleep(due - performance.now());
      }
    } finally {
      reel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }).finished.then(
        () => reel.remove(),
        () => reel.remove(),
      );
    }
  }

  // While rolling: Esc stops it and clicks on the wall do nothing.
  window.addEventListener("keydown", (e) => {
    if (rolling && e.key === "Escape") cancelRoll();
  });
  window.addEventListener(
    "click",
    (e) => {
      if (!rolling || !(e.target instanceof Node)) return;
      const target = e.target;
      if (!motion.cells("wall").some((c) => c.contains(target))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );

  // ---- Tidy (T§4.4).
  async function tidyUp() {
    if (rolling || caseOpen || tidying) return;
    tidying = true;
    try {
      if (!motion.calm) {
        tidyBtn.classList.remove("sweep");
        void tidyBtn.offsetWidth;
        tidyBtn.classList.add("sweep");
      }
      await trip();
      const n = motion.tidy();
      const back = motion.restore("wall", true);
      toast(n ? content.format("tidy.done", { n }) : content.text("tidy.clean"));
      host.emit("wall-tidied", {});
      updateBadge();
      await back;
    } finally {
      tidying = false;
    }
  }

  // If the mess is all off screen, go to the nearest piece first, so the button never seems
  // to do nothing.
  async function trip() {
    const away = motion.moved().map((id) => ({ el: motion.el(id)!, off: motion.offset(id) }));
    if (!away.length) return;
    const seen = (top: number, bottom: number) => bottom > 0 && top < innerHeight;
    const rects = away.map(({ el, off }) => ({ r: el.getBoundingClientRect(), off }));
    if (rects.some(({ r, off }) => seen(r.top, r.bottom) || seen(r.top - off.y, r.bottom - off.y))) return;
    const nearest = rects.reduce((a, b) => (Math.abs(b.r.top) < Math.abs(a.r.top) ? b : a));
    scrollTo({ top: Math.max(0, scrollY + nearest.r.top - innerHeight * 0.3), behavior: motion.calm ? "auto" : "smooth" });
    let still = 0;
    let y = scrollY;
    for (let waited = 0; waited < 2000 && still < 3; waited += 50) {
      await sleep(50);
      still = scrollY === y ? still + 1 : 0;
      y = scrollY;
    }
  }

  diveBtn.addEventListener("click", () => void dive(diveBtn));
  tidyBtn.addEventListener("click", () => void tidyUp());
  tidyBtn.addEventListener("animationend", () => tidyBtn.classList.remove("sweep"));

  host.on("case-opened", ({ id }) => {
    caseOpen = true;
    last = id;
    if (rolling) cancelRoll();
    dock.classList.add("away");
  });
  host.on("case-closed", () => {
    caseOpen = false;
    dock.classList.remove("away");
  });

  // ---- The dive block on the wall: same as the round button.
  host.fill("wall-dive", (place) => {
    const card = h(
      "button",
      { type: "button", class: "dive-card" },
      t.bind(h("span", { class: "dive-card-kick mono" }), "dive.kicker"),
      h("span", { class: "dive-card-disc", "aria-hidden": "true" }, h("img", { src: "/whale.svg", alt: "", draggable: "false" })),
      t.bind(h("b", { class: "dive-card-title" }), "dive.title"),
      t.bind(h("span", { class: "dive-card-sub mono" }), "dive.sub"),
    );
    t.bind(card, "cursor.dive", "data-cursor");
    card.addEventListener("click", () => void dive(card));
    place.append(card);
    if (motion.idOf(place) === undefined) motion.add(card, { kind: "block", raise: place });
  });

  host.on("language-changed", () => {
    t.refresh();
    showCore();
    paintRing();
  });
}
