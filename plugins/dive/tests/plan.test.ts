import { describe, expect, test } from "bun:test";
import { arrange, arrangeDense, frameScroll, packHoles, pickCase, ROULETTE_STEPS, rouletteStart, rouletteTimes, type Span } from "../plan.ts";

// Seeded generator (mulberry32) so every run checks the same sequences.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("pick", () => {
  test("never the same case twice in a row", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8];
    const rand = seeded(7);
    let last: number | undefined;
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const id = pickCase(ids, last, rand);
      expect(id).not.toBe(last);
      expect(ids).toContain(id);
      seen.add(id);
      last = id;
    }
    expect(seen.size).toBe(8);
  });

  test("a single case is still picked", () => {
    expect(pickCase([4], 4, () => 0.9)).toBe(4);
  });
});

describe("arrangement", () => {
  const items = Array.from({ length: 34 }, (_, i) => ({ i, isCase: i % 4 === 0 }));
  test("keeps every cell and puts the target between two cases", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const target = items[(seed * 4) % 32];
      const out = arrange(items, target, (x) => x.isCase, seeded(seed));
      expect(out).toHaveLength(items.length);
      expect(new Set(out).size).toBe(items.length);
      const at = out.indexOf(target);
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(out.length - 1);
      expect(out[at - 1].isCase).toBe(true);
      expect(out[at + 1].isCase).toBe(true);
    }
  });

  test("actually shuffles", () => {
    const out = arrange(items, items[0], (x) => x.isCase, seeded(3));
    expect(out.map((x) => x.i)).not.toEqual(items.map((x) => x.i));
  });

  test("with fewer than two other cases the target is simply placed", () => {
    const few = [{ c: true }, { c: false }, { c: false }];
    expect(arrange(few, few[0], (x) => x.c, seeded(1))).toHaveLength(3);
  });
});

// The wall's cells as the browser reports them at 1440 (8 columns) and 1024 (6 columns):
// "4x3t" = 4 columns x 3 rows, a case tile; "F" = pinned across the whole row (the ticker).
const WALLS: [number, string][] = [
  [8, "4x3t 3x3 1x1 1x1 1x1 3x3t Fx1 4x3t 1x1 1x1 1x1 2x1 1x1 4x3t 1x1 1x1 1x1 1x1 1x1 1x1 1x1 1x1 1x1 4x3t 4x3t 3x3t 2x3t 3x2 1x1 1x1 1x1"],
  [6, "4x3t 3x3 1x1 1x1 1x1 3x3t Fx1 4x3t 1x1 1x1 1x1 2x1 1x1 4x3t 1x1 1x1 1x1 1x1 1x1 1x1 1x1 1x1 1x1 4x3t 4x3t 3x3t 2x3t 3x3 1x1 1x1 1x1 1x1 1x1 1x1"],
];
const cellsOf = (spec: string) =>
  spec.split(" ").map((c, i) => {
    const [w, h] = c.replace("t", "").split("x");
    return { i, tile: c.endsWith("t"), span: { w: w === "F" ? 0 : Number(w), h: Number(h), full: w === "F" } as Span };
  });

describe("dense shuffle", () => {
  test("packs like grid-auto-flow: dense", () => {
    // 2 columns: a 1x1, then a 2x1 cannot fit beside it, a later 1x1 back-fills the hole.
    expect(packHoles([{ w: 1, h: 1, full: false }, { w: 2, h: 1, full: false }], 2)).toBe(1);
    expect(packHoles([{ w: 1, h: 1, full: false }, { w: 2, h: 1, full: false }, { w: 1, h: 1, full: false }], 2)).toBe(0);
    // A pinned full row waits for the first empty row.
    expect(packHoles([{ w: 1, h: 2, full: false }, { w: 0, h: 1, full: true }], 3)).toBe(4);
  });

  test("the wall in its own order has no holes", () => {
    for (const [cols, spec] of WALLS) expect(packHoles(cellsOf(spec).map((c) => c.span), cols)).toBe(0);
  });

  test("a random shuffle often leaves holes; the dense one never does and keeps the target between two cases", () => {
    for (const [cols, spec] of WALLS) {
      const cells = cellsOf(spec);
      const tiles = cells.filter((c) => c.tile);
      let plainHoles = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const target = tiles[seed % tiles.length];
        const rand = seeded(seed);
        if (packHoles(arrange(cells, target, (c) => c.tile, rand).map((c) => c.span), cols) > 0) plainHoles++;
        const out = arrangeDense(cells, target, (c) => c.tile, (c) => c.span, cols, rand);
        expect(packHoles(out.map((c) => c.span), cols)).toBe(0);
        expect(new Set(out).size).toBe(cells.length);
        const at = out.indexOf(target);
        expect(out[at - 1].tile && out[at + 1].tile).toBe(true);
      }
      expect(plainHoles).toBeGreaterThan(30);
    }
  });

  test("hidden cells (span null) are left out of the packing", () => {
    const cells = cellsOf("2x1t 1x1 2x1t 2x1t");
    const out = arrangeDense(cells, cells[2], (c) => c.tile, (c) => (c.i === 1 ? null : c.span), 2, seeded(5));
    expect(out).toHaveLength(4);
  });
});

describe("roulette", () => {
  test("16 steps: first dwell ~38 ms, last before landing ~413 ms, 2700 ms in all", () => {
    const times = rouletteTimes(16);
    expect(times).toHaveLength(17);
    expect(times[0]).toBeCloseTo(37.9, 1);
    expect(times[15]).toBeCloseTo(412.9, 1);
    expect(times.reduce((a, b) => a + b, 0)).toBeCloseTo(2700, 6);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  test("16 steps, and the landing lights the target whatever the number of candidates", () => {
    expect(ROULETTE_STEPS).toBe(16);
    for (let n = 1; n <= 12; n++)
      for (let ti = 0; ti < n; ti++) {
        const start = rouletteStart(n, ti);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(start).toBeLessThan(n);
        expect((ROULETTE_STEPS + start) % n).toBe(ti);
      }
  });
});

describe("framing", () => {
  test("desktop centres the three-tile group when it fits", () => {
    // room = 900 - 80 - 30 = 790; group 400 tall -> top at 80 + 195
    expect(frameScroll({ top: 1000, bottom: 1300 }, { top: 950, bottom: 1350 }, 900, false)).toBe(950 - 80 - 195);
  });
  test("desktop bottom-aligns the target when only it fits", () => {
    expect(frameScroll({ top: 1000, bottom: 1500 }, { top: 0, bottom: 1500 }, 900, false)).toBe(1500 - 80 - 790);
  });
  test("phone centres the target alone", () => {
    // room = 844 - 80 - 100 = 664; tile 400 tall -> top at 80 + 132
    expect(frameScroll({ top: 2000, bottom: 2400 }, { top: 1500, bottom: 2900 }, 844, true)).toBe(2000 - 80 - 132);
  });
});
