import { describe, expect, test } from "bun:test";
import { packHoles } from "../../dive/plan.ts";
import { denseOrder, type Span } from "../pack.ts";

// The wall in DOM order as the browser sizes it at 1440 (8 columns), 1024 (6) and 390 (2):
// "4x3" = 4 columns x 3 rows, T = team badge (1x1), M = the team block, F = the ticker across
// the whole row, "-" = not shown at that width.
const WALLS: [number, string][] = [
  [8, "4x3 3x3 T T 1x1 3x3 F 4x3 2x1 1x1 2x1 1x1 4x3 T T 1x1 1x1 1x1 1x1 1x1 1x1 1x1 4x3 4x3 3x3 2x3 M3x2 1x1 2x1 - - -"],
  [6, "4x3 3x3 T T 1x1 3x3 F 4x3 2x1 1x1 2x1 1x1 4x3 T T 1x1 1x1 1x1 1x1 1x1 1x1 1x1 4x3 4x3 3x3 2x3 M3x3 1x1 2x1 1x1 1x1 1x1"],
  [2, "2x3 2x2 T T - 2x2 F 2x3 1x1 1x1 2x1 1x1 2x3 T T 1x1 1x1 - - - 1x1 - 2x3 2x3 2x2 1x2 M2x2 1x1 1x1 - - -"],
];

interface Cell {
  i: number;
  kind: "team" | "tag" | "other";
  span: Span | null;
}
const cellsOf = (spec: string): Cell[] =>
  spec.split(" ").map((t, i) => {
    if (t === "-") return { i, kind: "other", span: null };
    if (t === "F") return { i, kind: "other", span: { w: 0, h: 1, full: true } };
    if (t === "T") return { i, kind: "tag", span: { w: 1, h: 1, full: false } };
    const [w, h] = t.replace("M", "").split("x").map(Number);
    return { i, kind: t.startsWith("M") ? "team" : "other", span: { w, h, full: false } };
  });

// The roll call's wish: the team block, the badges, then the rest as they stand.
const rollCall = (cells: Cell[]) => {
  const front = [...cells.filter((c) => c.kind === "team"), ...cells.filter((c) => c.kind === "tag")];
  return [...front, ...cells.filter((c) => !front.includes(c))];
};
const shown = (order: Cell[]) => order.filter((c) => c.span).map((c) => c.span!);

describe("roll call order", () => {
  for (const [cols, spec] of WALLS) {
    test(`${cols} columns: every cell once, the team block first, no holes`, () => {
      const cells = cellsOf(spec);
      const out = denseOrder(rollCall(cells), (c) => c.span, cols)!;
      expect(out).not.toBeNull();
      expect(new Set(out).size).toBe(cells.length);
      expect(out[0].kind).toBe("team");
      expect(packHoles(shown(out), cols)).toBe(0);
      const hidden = cells.filter((c) => !c.span).length;
      expect(out.slice(out.length - hidden).every((c) => !c.span)).toBe(true);
    });
  }

  test("8 and 2 columns: the four badges right after the team block", () => {
    for (const [cols, spec] of WALLS.filter(([c]) => c !== 6)) {
      const out = denseOrder(rollCall(cellsOf(spec)), (c) => c.span, cols)!;
      expect(out.slice(1, 5).map((c) => c.kind)).toEqual(["tag", "tag", "tag", "tag"]);
    }
  });

  test("6 columns: no order with the four badges right after the team block packs, so they come a cell or two later", () => {
    const [cols, spec] = WALLS.find(([c]) => c === 6)!;
    const cells = cellsOf(spec);
    // The badges straight after the team block, the rest as it stands: holes.
    expect(packHoles(shown(rollCall(cells)), cols)).toBeGreaterThan(0);
    const out = denseOrder(rollCall(cells), (c) => c.span, cols)!;
    const at = out.flatMap((c, i) => (c.kind === "tag" ? [i] : []));
    expect(at.length).toBe(4);
    expect(Math.max(...at)).toBeLessThan(8);
  });
});

describe("dense order", () => {
  const s = (w: number, h: number): Span => ({ w, h, full: false });

  test("an order that packs as it stands is kept", () => {
    const cells = [s(2, 1), s(1, 1), s(1, 1), s(2, 2)];
    expect(denseOrder(cells, (c) => c, 2)).toEqual(cells);
  });

  test("a slot the next cell does not fit takes the earliest cell that does", () => {
    const [a, wide, b] = [s(1, 1), s(3, 1), s(2, 1)];
    expect(denseOrder([a, wide, b], (c) => c, 3)).toEqual([a, b, wide]);
  });

  test("hidden cells go last", () => {
    const hidden = { w: 9, h: 9, full: false };
    const cells = [hidden, s(1, 1), s(1, 1)];
    expect(denseOrder(cells, (c) => (c === hidden ? null : c), 2)).toEqual([cells[1], cells[2], hidden]);
  });

  test("cells that cannot fill whole rows have no order", () => {
    expect(denseOrder([s(1, 1)], (c) => c, 2)).toBeNull();
    expect(denseOrder([s(2, 2), s(1, 3), s(1, 1)], (c) => c, 2)).toBeNull();
  });
});
