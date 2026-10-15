// Wall order for a reorder that must keep the wall dense (the roll call). Pure, so it is tested
// directly. The dive's shuffle has its own search (plugins/dive/plan.ts).

// A cell's size on the grid; full = pinned across the whole row (the ticker).
export interface Span {
  w: number;
  h: number;
  full: boolean;
}

// The order to append the cells in so grid-auto-flow: dense leaves no holes, as close to the
// wished order as that allows. Each first empty slot, row by row, takes the earliest cell in the
// wished order that fits there and still lets the rest pack; a slot no cell can fill sends the
// search back a step. The browser then puts every cell where the search did: each one fits the
// first empty slot, and every slot before it is taken. Cells with no span (not shown) go last.
// null when no such order turns up within the budget.
export function denseOrder<T>(wished: T[], span: (cell: T) => Span | null, cols: number, budget = 20000): T[] | null {
  if (cols < 1) return null;
  const left = wished.flatMap((cell) => {
    const s = span(cell);
    return s ? [{ cell, w: s.full ? cols : Math.min(s.w, cols), h: s.h, full: s.full }] : [];
  });
  type Item = (typeof left)[number];
  // Without holes the cells fill whole rows, and none reaches below the last of them.
  const end = left.reduce((sum, c) => sum + c.w * c.h, 0);
  if (end % cols) return null;
  const tall = Math.max(1, ...left.map((c) => c.h));
  const size = (c: Item) => `${c.full ? "F" : c.w}x${c.h}`;
  // A cell wider than half the wall shares its rows with no other such cell, so the rest of each
  // of its rows is cells at most `narrow` wide, or cells already placed there.
  const wide = (c: Item) => !c.full && c.w * 2 > cols;
  const narrow = cols - Math.min(cols, ...left.filter(wide).map((c) => c.w));

  const taken: boolean[] = [];
  const firstFree = () => {
    let k = 0;
    while (taken[k]) k++;
    return k;
  };
  // The slots a cell takes when placed at slot `at`, or null when it does not fit there.
  const slotsAt = (at: number, c: Item) => {
    if (c.full ? at % cols !== 0 : (at % cols) + c.w > cols) return null;
    if (at + (c.h - 1) * cols >= end) return null;
    const slots: number[] = [];
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) slots.push(at + y * cols + x);
    return slots.some((k) => taken[k]) ? null : slots;
  };
  // Not enough narrow cells (and placed cells in rows a wide cell still fits in) to flank the
  // wide cells left: no order from here packs.
  const short = (row: number) => {
    let need = 0;
    let have = 0;
    for (const c of left) {
      if (wide(c)) need += (cols - c.w) * c.h;
      else if (!c.full && c.w <= narrow) have += c.w * c.h;
    }
    if (!need) return false;
    for (let r = row; r < row + tall; r++) {
      let used = 0;
      for (let x = 0; x < cols; x++) if (taken[r * cols + x]) used++;
      if (used <= narrow) have += used;
    }
    return need > have;
  };

  const order: T[] = [];
  const dead = new Set<string>();
  let steps = 0;
  const solve = (): boolean => {
    const at = firstFree();
    if (!left.length) return taken.lastIndexOf(true) < at; // nothing taken past the first empty slot
    if (++steps > budget) return false;
    const row = Math.floor(at / cols);
    let state = `${at % cols}:`;
    for (let k = at; k < (row + tall) * cols; k++) state += taken[k] ? "1" : "0";
    state += `|${left.map(size).sort().join(",")}`;
    if (dead.has(state)) return false;
    if (!short(row)) {
      const tried = new Set<string>();
      for (let i = 0; i < left.length; i++) {
        const c = left[i];
        if (tried.has(size(c))) continue; // a cell of the same size packs the same way
        tried.add(size(c));
        const slots = slotsAt(at, c);
        if (!slots) continue;
        for (const k of slots) taken[k] = true;
        left.splice(i, 1);
        order.push(c.cell);
        if (solve()) return true;
        order.pop();
        left.splice(i, 0, c);
        for (const k of slots) taken[k] = false;
      }
    }
    if (steps <= budget) dead.add(state);
    return false;
  };
  return solve() ? [...order, ...wished.filter((cell) => !span(cell))] : null;
}
