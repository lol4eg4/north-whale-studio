// Drag: every Motion piece can be picked up and left anywhere (T§4.1). One delegated
// pointerdown on the document, move/up/cancel on the window; the gesture rules live in
// gesture.ts. Mouse/pen drag after 5 px; touch lifts after a 260 ms hold.
//
//   position  --dx = dx0 + (x - x0),  --dy = dy0 + (y - y0) + (scrollY - sy0)   (fixed pieces: no scroll term)
//   edges     auto-scroll up to 1100 px/s, quadratic ramp in the top/bottom zones
//   release   clicks swallowed for 350 ms, so a dropped tile never opens
import type { Host } from "../../platform/host.ts";
import { binder } from "../../platform/text-binder.ts";
import { h, isTouch } from "../../platform/ui/parts.ts";
import type { ContentApi } from "../content/api.ts";
import { createGesture, HOLD_MS, type PointerKind, type Step } from "./gesture.ts";
import "./style.css";

interface Hand {
  id: number;
  el: HTMLElement;
  pointerId: number;
  fixed: boolean;
  floor: number; // highest point on screen for a fixed piece: the bar's own pieces may go up to 0
  base: { x: number; y: number };
  x0: number;
  y0: number;
  sy0: number;
  pageH: number; // page height when grabbed (a dragged piece must not stretch it)
  x: number;
  y: number;
  grabbed: boolean;
}

export default function init(host: Host) {
  const motion = host.motion;
  const content = host.use<ContentApi>("content");
  const t = binder(content.text);
  const root = document.documentElement;
  const gesture = createGesture();
  const touchDevice = isTouch();

  let hand: Hand | null = null;
  let caseOpen = false;
  let holdTimer = 0;
  let frame = 0;
  let lastFrame = 0;

  // A piece inside a fixed layer (the dock) or the sticky top bar (the studio name) is not
  // carried by the page scroll.
  const layerOf = (el: HTMLElement) => {
    for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") return p;
    }
    return null;
  };

  const place = () => {
    if (!hand) return;
    let x = hand.base.x + hand.x - hand.x0;
    let y = hand.base.y + hand.y - hand.y0 + (hand.fixed ? 0 : scrollY - hand.sy0);
    motion.moveTo(hand.id, x, y);
    // Pieces stay on the page (fixed ones on screen, below the top bar): a piece dragged past an
    // edge would be out of reach and would make the page scroll sideways.
    const r = hand.el.getBoundingClientRect();
    const w = root.clientWidth;
    const top = hand.fixed ? hand.floor : -scrollY;
    const bottom = hand.fixed ? innerHeight : hand.pageH - scrollY;
    if (r.left < 0) x -= r.left;
    else if (r.right > w) x -= r.right - w;
    if (r.top < top) y += top - r.top;
    else if (r.bottom > bottom) y -= r.bottom - bottom;
    motion.moveTo(hand.id, x, y);
  };

  // Edge auto-scroll (T§4.1.5).
  const edge = (now: number) => {
    if (!hand || gesture.phase !== "drag") return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const vh = innerHeight;
    const zone = Math.min(110, vh * 0.14);
    let k = hand.y < zone ? -(zone - hand.y) / zone : hand.y > vh - zone ? (hand.y - (vh - zone)) / zone : 0;
    k = Math.max(-1, Math.min(1, k));
    if (k && dt > 0) {
      scrollBy({ top: k * Math.abs(k) * 1100 * dt, behavior: "instant" });
      place();
    }
    frame = requestAnimationFrame(edge);
  };

  const grab = () => {
    if (!hand || hand.grabbed) return;
    hand.grabbed = true;
    motion.lift(hand.id, true);
    motion.front(hand.id);
    host.emit("piece-grabbed", { piece: hand.id });
  };

  const finish = () => {
    clearTimeout(holdTimer);
    cancelAnimationFrame(frame);
    if (!hand) return;
    const { id, el, grabbed } = hand;
    hand = null;
    el.classList.remove("dragging");
    motion.lift(id, false);
    if (el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    if (grabbed) host.emit("piece-dropped", { piece: id });
  };

  const act = (step: Step, pointerId?: number) => {
    if (!hand) return;
    switch (step) {
      case "lift":
        grab();
        // Chrome blocks (and logs) vibrate before the first tap anywhere on the page.
        if (navigator.userActivation?.hasBeenActive ?? true) navigator.vibrate?.(8);
        break;
      case "start":
        clearTimeout(holdTimer);
        grab();
        hand.el.classList.add("dragging");
        if (pointerId !== undefined && hand.el.isConnected) {
          try {
            hand.el.setPointerCapture(pointerId);
          } catch {}
        }
        getSelection()?.removeAllRanges();
        place();
        if (!hand.fixed) {
          lastFrame = performance.now();
          frame = requestAnimationFrame(edge);
        }
        break;
      case "move":
        place();
        break;
      case "drop":
      case "putdown":
        finish();
        break;
      case "click":
      case "scroll":
      case "cancel":
        clearTimeout(holdTimer);
        hand = null;
        break;
    }
  };

  document.addEventListener("pointerdown", (e) => {
    if (hand || !e.isPrimary || e.button !== 0) return;
    if (caseOpen || motion.held) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest("dialog[open]")) return;
    const id = motion.idOf(target);
    if (id === undefined) return;
    const el = motion.el(id)!;
    const kind: PointerKind = e.pointerType === "touch" ? "touch" : e.pointerType === "pen" ? "pen" : "mouse";
    const layer = layerOf(el);
    hand = { id, el, pointerId: e.pointerId, fixed: !!layer, floor: layer === "sticky" ? 0 : 50, base: motion.offset(id), x0: e.clientX, y0: e.clientY, sy0: scrollY, pageH: root.scrollHeight, x: e.clientX, y: e.clientY, grabbed: false };
    gesture.down(kind, e.clientX, e.clientY, e.timeStamp);
    if (kind === "touch") holdTimer = window.setTimeout(() => act(gesture.timer(performance.now())), HOLD_MS);
  });

  window.addEventListener("pointermove", (e) => {
    if (!hand || e.pointerId !== hand.pointerId) return;
    // The button came up where we did not hear it (a Mac ctrl-click menu, outside the window).
    if (e.pointerType === "mouse" && e.buttons === 0) return act(gesture.up(e.timeStamp));
    hand.x = e.clientX;
    hand.y = e.clientY;
    act(gesture.move(e.clientX, e.clientY, e.timeStamp), e.pointerId);
  });
  window.addEventListener("pointerup", (e) => {
    if (!hand || e.pointerId !== hand.pointerId) return;
    act(gesture.up(e.timeStamp));
  });
  window.addEventListener("pointercancel", (e) => {
    if (!hand || e.pointerId !== hand.pointerId) return;
    act(gesture.cancel(e.timeStamp));
  });
  // The page scrolling under a held piece keeps it glued to the finger or cursor.
  window.addEventListener("scroll", () => hand && gesture.phase === "drag" && !hand.fixed && place(), { passive: true });

  // A drop never opens what it lands on (capture phase, before any owner's handler).
  window.addEventListener(
    "click",
    (e) => {
      if (!gesture.suppress(e.timeStamp)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );

  // While a piece is in the hand: no page scroll, no callout menu, no text selection.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (hand && gesture.held && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  for (const type of ["contextmenu", "selectstart"]) document.addEventListener(type, (e) => hand && gesture.held && e.preventDefault());
  // The browser's own image/link drag never starts on a piece.
  document.addEventListener("dragstart", (e) => {
    if (motion.idOf(e.target instanceof Element ? e.target : null) !== undefined) e.preventDefault();
  });

  host.on("case-opened", () => {
    caseOpen = true;
    if (hand) act(gesture.cancel(performance.now()));
  });
  host.on("case-closed", () => (caseOpen = false));

  // The wall header hint: what to do with the pieces, in the words for this pointer.
  host.fill("wall-hint", (place) => {
    place.append(t.bind(h("p", { class: "drag-hint mono" }), touchDevice ? "wall.hintCoarse" : "wall.hintFine"));
  });
  host.on("language-changed", () => t.refresh());
}
