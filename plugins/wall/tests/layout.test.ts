import { describe, expect, test } from "bun:test";
import { isSticker, starPoints, tilts, W } from "../layout.ts";

describe("wall order", () => {
  test("35 cells: 10 cases, 8 clients and 4 team badges once each, one dive cell, one clients' sheet", () => {
    expect(W.length).toBe(35);
    expect(W.filter((s) => s.k === "sheet").length).toBe(1);
    const ids = (k: string) => W.filter((s) => s.k === k).map((s) => ("id" in s ? s.id : "i" in s ? s.i : 0)).sort((a, b) => a - b);
    expect(ids("tile")).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10, 11]);
    expect(ids("client")).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(ids("tag")).toEqual([0, 1, 2, 3]);
    expect(W.filter((s) => s.k === "dive").length).toBe(1);
  });

  test("badges come in team order down the wall; one service sticker is wide; Skyeng, Axie Infinity and Tria are the tablet's narrow tiles", () => {
    expect(W.flatMap((s) => (s.k === "tag" ? [s.i] : []))).toEqual([0, 1, 2, 3]);
    expect(W.flatMap((s) => (s.k === "svc" && s.wide ? [s.id] : []))).toEqual([2]);
    expect(W.flatMap((s) => (s.k === "tile" && s.narrow ? [s.id] : []))).toEqual([9, 10, 11]);
  });

  test("the wall closes with the team block, the clients' sheet and two clients", () => {
    expect(W.slice(-4).map((s) => s.k)).toEqual(["team", "sheet", "client", "client"]);
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
