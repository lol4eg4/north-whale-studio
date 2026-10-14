import { describe, expect, test } from "bun:test";
import { isSticker, starPoints, tilts, W } from "../layout.ts";

describe("wall order", () => {
  test("34 cells: 8 cases, 8 clients and 6 team members once each, one dive cell", () => {
    expect(W.length).toBe(34);
    const ids = (k: string) => W.filter((s) => s.k === k).map((s) => ("id" in s ? s.id : "i" in s ? s.i : 0)).sort((a, b) => a - b);
    expect(ids("tile")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ids("client")).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(ids("tag")).toEqual([0, 1, 2, 3, 4, 5]);
    expect(W.filter((s) => s.k === "dive").length).toBe(1);
  });

  test("sticker tilts are the same on every visit and stay within ±7 deg", () => {
    const n = W.filter(isSticker).length;
    const a = tilts(n);
    expect(a).toEqual(tilts(n));
    expect(a.every((r) => Math.abs(r) <= 7)).toBe(true);
    expect(new Set(a).size).toBeGreaterThan(n / 2);
  });

  test("the starburst has 28 points", () => {
    expect(starPoints().split(" ").length).toBe(28);
  });
});
