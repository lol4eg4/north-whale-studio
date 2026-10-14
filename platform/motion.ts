// Moving pieces: every tile, sticker, slogan letter and nav item a visitor can push around.
// Owners register their pieces; plugins above move them without knowing whose they are.
//
//   piece offset  --dx/--dy (px)  -> CSS translate        (drag, fling, tidy)
//   piece spin    --spin (deg)    -> CSS transform rotate (whale knocks)
//   group order   DOM children    -> FLIP animation       (shuffle, restore)
//
// Calm (prefers-reduced-motion) keeps every feature but drops the animation.
import type { Memory } from "./memory.ts";
import { springEasing } from "./spring.ts";

export type PieceKind = "tile" | "sticker" | "block" | "letter" | "word" | "nav" | "dock";

export interface PieceInfo {
  kind: PieceKind;
  tag?: number; // owner's number, e.g. the case id of a tile or client sticker
  target?: boolean; // the whale's target (the studio name in the nav)
  raise?: HTMLElement; // element whose z-index goes up when the piece is in front (wall cell)
}

export interface Motion {
  readonly calm: boolean;
  readonly paused: boolean;
  setPaused(on: boolean): void;
  // While held (the dive is rearranging the wall), nobody picks pieces up.
  readonly held: boolean;
  hold(on: boolean): void;
  onChange(fn: () => void): () => void;
  add(el: HTMLElement, info: PieceInfo): number;
  remove(id: number): void;
  el(id: number): HTMLElement | undefined;
  info(id: number): PieceInfo | undefined;
  idOf(node: Element | null): number | undefined;
  ids(): number[];
  offset(id: number): { x: number; y: number };
  moveTo(id: number, x: number, y: number): void;
  lift(id: number, on: boolean): void;
  front(id: number): void;
  fling(id: number, vx: number, vy: number, spin: number): void;
  moved(): number[];
  tidy(): number;
  group(name: string, container: HTMLElement): void;
  cells(name: string): HTMLElement[];
  reorder(name: string, arrange: (cells: HTMLElement[]) => HTMLElement[], spin: boolean): Promise<void>;
  restore(name: string, spin: boolean): Promise<void>;
  readonly spring: { easing: string; duration: number };
}

interface Piece {
  el: HTMLElement;
  info: PieceInfo;
  x: number;
  y: number;
  spin: number;
}

const HOME_EASE = "cubic-bezier(.3,1.5,.5,1)";
const NAV_HOME_EASE = "cubic-bezier(.2,.8,.2,1)";

export function createMotion(memory: Memory, win: Window = window): Motion {
  const doc = win.document;
  const pieces = new Map<number, Piece>();
  const groups = new Map<string, { container: HTMLElement; original: HTMLElement[] }>();
  const listeners = new Set<() => void>();
  const reduce = win.matchMedia("(prefers-reduced-motion: reduce)");
  const spring = springEasing(typeof CSS !== "undefined" && CSS.supports("transition-timing-function", "linear(0, 1)"));
  let nextId = 1;
  let zTop = 5;
  let paused = memory.get("paused") === "1";
  let held = false;

  const changed = () => {
    doc.documentElement.classList.toggle("calm", reduce.matches);
    doc.documentElement.classList.toggle("paused", paused || reduce.matches);
    for (const fn of [...listeners]) fn();
  };
  reduce.addEventListener?.("change", changed);
  changed();

  const write = (p: Piece) => {
    p.el.style.setProperty("--dx", `${p.x}px`);
    p.el.style.setProperty("--dy", `${p.y}px`);
    p.el.style.setProperty("--spin", `${p.spin}deg`);
  };
  const onScreen = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < win.innerHeight && r.right > 0 && r.left < win.innerWidth;
  };

  const motion: Motion = {
    get calm() {
      return reduce.matches;
    },
    get paused() {
      return paused || reduce.matches;
    },
    spring,
    setPaused(on) {
      paused = on;
      memory.set("paused", on ? "1" : "0");
      changed();
    },
    get held() {
      return held;
    },
    hold(on) {
      held = on;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    add(el, info) {
      const id = nextId++;
      pieces.set(id, { el, info, x: 0, y: 0, spin: 0 });
      el.classList.add("piece");
      el.dataset.piece = String(id);
      if (el instanceof HTMLAnchorElement || el instanceof HTMLImageElement) el.draggable = false;
      return id;
    },
    remove(id) {
      const p = pieces.get(id);
      if (!p) return;
      p.el.classList.remove("piece", "lifted");
      delete p.el.dataset.piece;
      pieces.delete(id);
    },
    el: (id) => pieces.get(id)?.el,
    info: (id) => pieces.get(id)?.info,
    idOf(node) {
      const el = node?.closest<HTMLElement>("[data-piece]");
      const id = el ? Number(el.dataset.piece) : NaN;
      return pieces.has(id) ? id : undefined;
    },
    ids: () => [...pieces.keys()],
    offset(id) {
      const p = pieces.get(id);
      return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
    },
    moveTo(id, x, y) {
      const p = pieces.get(id);
      if (!p) return;
      p.x = x;
      p.y = y;
      write(p);
    },
    lift(id, on) {
      pieces.get(id)?.el.classList.toggle("lifted", on);
    },
    front(id) {
      const p = pieces.get(id);
      if (!p) return;
      (p.info.raise ?? p.el).style.zIndex = String(++zTop);
    },
    fling(id, vx, vy, spin) {
      const p = pieces.get(id);
      if (!p) return;
      const from = { x: p.x, y: p.y, spin: p.spin };
      // A knocked piece slides about a third of a second's worth of its speed, then rests.
      p.x += vx * 0.35;
      p.y += vy * 0.35;
      p.spin += spin;
      write(p);
      motion.front(id);
      if (reduce.matches) return;
      p.el.animate(
        [
          { translate: `${from.x}px ${from.y}px`, transform: `rotate(${from.spin}deg)` },
          { translate: `${p.x}px ${p.y}px`, transform: `rotate(${p.spin}deg)` },
        ],
        { duration: spring.duration, easing: spring.easing },
      );
    },
    moved: () => [...pieces].filter(([, p]) => p.x || p.y || p.spin).map(([id]) => id),
    tidy() {
      // Reads, then writes, then one more read: two layouts in all, however many pieces moved.
      const moved = motion.moved().map((id) => pieces.get(id)!);
      const was = moved.map((p) => ({ p, from: { x: p.x, y: p.y, spin: p.spin }, visible: onScreen(p.el) }));
      for (const { p } of was) {
        p.x = p.y = p.spin = 0;
        write(p);
        (p.info.raise ?? p.el).style.zIndex = "";
      }
      if (!reduce.matches) {
        const homeOnScreen = was.map(({ p, visible }) => !visible && onScreen(p.el));
        let popped = 0;
        was.forEach(({ p, from, visible }, i) => {
          if (visible) {
            p.el.animate(
              [
                { translate: `${from.x}px ${from.y}px`, transform: `rotate(${from.spin}deg)` },
                { translate: "0px 0px", transform: "rotate(0deg)" },
              ],
              { duration: 700, easing: p.info.kind === "nav" ? NAV_HOME_EASE : HOME_EASE },
            );
          } else if (homeOnScreen[i]) {
            // It was away from the screen but its home is on screen: pop back in.
            p.el.animate(
              [
                { scale: 0.15, opacity: 0, transform: `rotate(${popped % 2 ? 40 : -40}deg)` },
                { scale: 1, opacity: 1, transform: "rotate(0deg)" },
              ],
              { duration: 650, easing: spring.easing, delay: 40 * popped++, fill: "backwards" },
            );
          }
        });
      }
      zTop = 5;
      return moved.length;
    },
    group(name, container) {
      groups.set(name, { container, original: [...container.children] as HTMLElement[] });
    },
    cells(name) {
      const g = groups.get(name);
      return g ? ([...g.container.children] as HTMLElement[]) : [];
    },
    reorder(name, arrange, spin) {
      const g = groups.get(name);
      if (!g) return Promise.resolve();
      return flip(g.container, () => g.container.append(...arrange(motion.cells(name))), spin);
    },
    restore(name, spin) {
      const g = groups.get(name);
      if (!g) return Promise.resolve();
      return flip(g.container, () => g.container.append(...g.original), spin);
    },
  };

  // FLIP: measure, reorder, measure, then animate every moved cell from its old place.
  function flip(container: HTMLElement, mutate: () => void, spin: boolean): Promise<void> {
    const cells = [...container.children] as HTMLElement[];
    const before = new Map(cells.map((c) => [c, c.getBoundingClientRect()]));
    for (const c of cells) for (const a of c.getAnimations()) a.cancel();
    mutate();
    for (const c of cells) c.style.zIndex = "";
    if (reduce.matches) return Promise.resolve();
    const done: Promise<unknown>[] = [];
    for (const c of cells) {
      const a = before.get(c)!;
      const b = c.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const delay = Math.random() * 160;
      done.push(
        c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "translate(0,0)" }], {
          duration: spring.duration + Math.random() * 220,
          easing: spring.easing,
          delay,
          fill: "backwards",
        }).finished,
      );
      const first = c.firstElementChild as HTMLElement | null;
      const id = motion.idOf(first);
      if (spin && first && id !== undefined && motion.info(id)?.kind === "sticker") {
        const turn = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 180);
        first.animate(
          [
            { transform: "rotate(0deg) scale(1)" },
            { transform: `rotate(${turn}deg) scale(1.15)`, offset: 0.55 },
            { transform: "rotate(0deg) scale(1)" },
          ],
          { duration: 900, easing: "cubic-bezier(.3,.7,.3,1)", delay },
        );
      }
    }
    return Promise.all(done).then(
      () => undefined,
      () => undefined,
    );
  }

  return motion;
}
