import { describe, expect, test } from "bun:test";
import { createGesture, HOLD_MS, SUPPRESS_MS } from "../gesture.ts";

describe("mouse and pen", () => {
  test("4 px is still a click", () => {
    const g = createGesture();
    g.down("mouse", 100, 100, 0);
    expect(g.move(104, 100, 10)).toBe("none");
    expect(g.move(100, 96, 20)).toBe("none");
    expect(g.up(30)).toBe("click");
    expect(g.suppress(40)).toBe(false);
  });

  test("5 px starts the drag, then every move moves", () => {
    const g = createGesture();
    g.down("pen", 100, 100, 0);
    expect(g.move(103, 104, 10)).toBe("start");
    expect(g.phase).toBe("drag");
    expect(g.move(130, 100, 20)).toBe("move");
    expect(g.up(30)).toBe("drop");
    expect(g.phase).toBe("idle");
  });

  test("the release after a drag swallows clicks for 350 ms, a later click goes through", () => {
    const g = createGesture();
    g.down("mouse", 0, 0, 0);
    g.move(30, 0, 10);
    expect(g.up(100)).toBe("drop");
    expect(g.suppress(101)).toBe(true);
    expect(g.suppress(100 + SUPPRESS_MS - 1)).toBe(true);
    expect(g.suppress(100 + SUPPRESS_MS)).toBe(false);
  });
});

describe("touch", () => {
  test("a 260 ms hold lifts, then 5 px drags", () => {
    const g = createGesture();
    g.down("touch", 50, 50, 1000);
    expect(g.timer(1000 + HOLD_MS - 1)).toBe("none");
    expect(g.move(53, 50, 1100)).toBe("none");
    expect(g.timer(1000 + HOLD_MS)).toBe("lift");
    expect(g.held).toBe(true);
    expect(g.move(54, 50, 1300)).toBe("none");
    expect(g.move(60, 50, 1310)).toBe("start");
    expect(g.up(1400)).toBe("drop");
    expect(g.suppress(1500)).toBe(true);
  });

  test("moving 11 px before the hold is a scroll: nothing lifts", () => {
    const g = createGesture();
    g.down("touch", 50, 50, 0);
    expect(g.move(50, 61, 100)).toBe("scroll");
    expect(g.phase).toBe("idle");
    expect(g.timer(HOLD_MS)).toBe("none");
    expect(g.held).toBe(false);
  });

  test("10 px of jitter during the hold still lifts", () => {
    const g = createGesture();
    g.down("touch", 50, 50, 0);
    expect(g.move(60, 50, 100)).toBe("none");
    expect(g.timer(HOLD_MS)).toBe("lift");
  });

  test("a move after 260 ms lifts even if the timer is late", () => {
    const g = createGesture();
    g.down("touch", 0, 0, 0);
    expect(g.move(2, 0, HOLD_MS + 5)).toBe("lift");
  });

  test("lifted and let go without moving puts the piece down, clicks are not swallowed", () => {
    const g = createGesture();
    g.down("touch", 0, 0, 0);
    g.timer(HOLD_MS);
    expect(g.up(400)).toBe("putdown");
    expect(g.suppress(410)).toBe(false);
  });

  test("a quick tap is a click", () => {
    const g = createGesture();
    g.down("touch", 0, 0, 0);
    expect(g.up(80)).toBe("click");
  });

  test("pointercancel during a drag drops the piece", () => {
    const g = createGesture();
    g.down("mouse", 0, 0, 0);
    g.move(20, 0, 10);
    expect(g.cancel(20)).toBe("drop");
    g.down("touch", 0, 0, 100);
    expect(g.cancel(150)).toBe("cancel");
  });
});
