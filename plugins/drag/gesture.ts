// One pointer gesture on a piece, as a pure state machine (T§4.1). The plugin feeds it pointer
// positions and times and acts on the step it returns.
//
//   mouse/pen: press --(>= 5 px)--> drag --(up)--> drop (clicks swallowed for 350 ms)
//              press --(up)--> click
//   touch:     hold --(260 ms still)--> lifted --(>= 5 px)--> drag --(up)--> drop
//              hold --(> 10 px before 260 ms)--> scroll (the page scrolls, nothing lifts)
//              lifted --(up)--> putdown
export const DRAG_PX = 5;
export const HOLD_MS = 260;
export const SLOP_PX = 10;
export const SUPPRESS_MS = 350;

export type PointerKind = "mouse" | "pen" | "touch";
export type Phase = "idle" | "press" | "hold" | "lifted" | "drag";
export type Step = "none" | "lift" | "start" | "move" | "drop" | "putdown" | "click" | "scroll" | "cancel";

export function createGesture() {
  let phase: Phase = "idle";
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let suppressUntil = -Infinity;
  const dist = (x: number, y: number) => Math.hypot(x - x0, y - y0);
  const timer = (t: number): Step => {
    if (phase !== "hold" || t - t0 < HOLD_MS) return "none";
    phase = "lifted";
    return "lift";
  };

  return {
    get phase() {
      return phase;
    },
    // Lifted or dragging: the piece is in the hand.
    get held() {
      return phase === "lifted" || phase === "drag";
    },
    down(kind: PointerKind, x: number, y: number, t: number): Step {
      x0 = x;
      y0 = y;
      t0 = t;
      phase = kind === "touch" ? "hold" : "press";
      return "none";
    },
    // The hold timer fired.
    timer,
    move(x: number, y: number, t: number): Step {
      switch (phase) {
        case "press":
        case "lifted":
          if (dist(x, y) < DRAG_PX) return "none";
          phase = "drag";
          return "start";
        case "hold":
          if (dist(x, y) > SLOP_PX) {
            phase = "idle";
            return "scroll";
          }
          return timer(t);
        case "drag":
          return "move";
        default:
          return "none";
      }
    },
    up(t: number): Step {
      const was = phase;
      phase = "idle";
      if (was === "drag") {
        suppressUntil = t + SUPPRESS_MS;
        return "drop";
      }
      if (was === "lifted") return "putdown";
      return was === "idle" ? "none" : "click";
    },
    // The browser took the pointer (pointercancel) or the page stopped the gesture.
    cancel(t: number): Step {
      const was = phase;
      phase = "idle";
      if (was === "drag") {
        suppressUntil = t + SUPPRESS_MS;
        return "drop";
      }
      if (was === "lifted") return "putdown";
      return was === "idle" ? "none" : "cancel";
    },
    // A click at time t comes right after a drag that moved: swallow it.
    suppress(t: number): boolean {
      return t < suppressUntil;
    },
  };
}
export type Gesture = ReturnType<typeof createGesture>;
