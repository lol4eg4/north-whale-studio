// «Рандомный кейс» decisions, pure so they are tested directly (T§4.3).
export type Rand = () => number;

// A random case, never the one picked or opened last.
export function pickCase(ids: number[], last: number | undefined, rand: Rand = Math.random): number {
  const pool = ids.filter((id) => id !== last);
  const from = pool.length ? pool : ids;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))];
}

// Shuffle the wall, then put the target between two other cases at a random place, so the
// roulette always has real cases around it on screen.
export function arrange<T>(items: T[], target: T, isCase: (item: T) => boolean, rand: Rand = Math.random): T[] {
  const rest = items.filter((x) => x !== target);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const cases = rest.filter(isCase);
  if (cases.length < 2) {
    rest.splice(Math.floor(rand() * (rest.length + 1)), 0, target);
    return rest;
  }
  const a = cases[Math.floor(rand() * cases.length)];
  const others = cases.filter((c) => c !== a);
  const b = others[Math.floor(rand() * others.length)];
  const left = rest.filter((x) => x !== a && x !== b);
  left.splice(Math.floor(rand() * (left.length + 1)), 0, a, target, b);
  return left;
}

// A cell's size on the wall grid; full = pinned across the whole row (the ticker).
export interface Span {
  w: number;
  h: number;
  full: boolean;
}

// Empty grid slots before the last filled one when the cells are packed in this order the way
// CSS grid-auto-flow: dense does it (each cell takes the first slot it fits, from the top).
export function packHoles(spans: Span[], cols: number): number {
  const taken: boolean[][] = [];
  const free = (r: number, c: number) => !taken[r]?.[c];
  let last = -1;
  for (const span of spans) {
    const w = span.full ? cols : Math.min(span.w, cols);
    for (let r = 0, placed = false; !placed; r++) {
      for (let c = 0; c + w <= cols && !placed; c++) {
        let fits = true;
        for (let y = 0; y < span.h && fits; y++) for (let x = 0; x < w && fits; x++) fits = free(r + y, c + x);
        if (!fits) continue;
        for (let y = 0; y < span.h; y++)
          for (let x = 0; x < w; x++) {
            (taken[r + y] ??= [])[c + x] = true;
            last = Math.max(last, (r + y) * cols + c + x);
          }
        placed = true;
      }
    }
  }
  let holes = 0;
  for (let k = 0; k < last; k++) if (!taken[Math.floor(k / cols)]?.[k % cols]) holes++;
  return holes;
}

// arrange() until the packed wall has no holes (a random shuffle leaves none about 1 time in
// 8 on 8 columns, 1 in 20 on 6); after the tries, the arrangement with the fewest holes.
// span(item) = null for a cell that is not shown.
export function arrangeDense<T>(items: T[], target: T, isCase: (item: T) => boolean, span: (item: T) => Span | null, cols: number, rand: Rand = Math.random, tries = 300): T[] {
  let best = items;
  let fewest = Infinity;
  for (let k = 0; k < tries && fewest > 0; k++) {
    const order = arrange(items, target, isCase, rand);
    const holes = packHoles(order.map(span).filter((s): s is Span => s !== null), cols);
    if (holes < fewest) {
      best = order;
      fewest = holes;
    }
  }
  return best;
}

// Roulette: 16 steps, then the landing. Step i lights candidate (i + start) % n, with the start
// chosen so the landing (step 16) falls on the target. (The reference starts at the first
// candidate and adds whole rounds instead, which makes the roll up to n steps longer.)
export const ROULETTE_STEPS = 16;
export function rouletteStart(n: number, targetIndex: number, steps = ROULETTE_STEPS): number {
  return (((targetIndex - steps) % n) + n) % n;
}

// Dwell per step, the landing included (steps + 1 values): w_i = .35 + (i / steps)^3 * 4.2,
// split from 2700 ms, so a fast flicker slows to a stop. The landing itself does not wait.
export function rouletteTimes(steps: number, total = 2700): number[] {
  const w = Array.from({ length: steps + 1 }, (_, i) => 0.35 + (i / steps) ** 3 * 4.2);
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (x / sum) * total);
}

// How far to scroll so the target (with its two neighbours on desktop) sits in view (T§4.3.4).
// Rects are viewport coordinates; returns the scrollBy distance.
export interface Box {
  top: number;
  bottom: number;
}
export function frameScroll(target: Box, group: Box, vh: number, phone: boolean): number {
  const topSafe = 80;
  const room = vh - topSafe - (phone ? 100 : 30);
  const th = target.bottom - target.top;
  if (phone) return th <= room ? target.top - topSafe - (room - th) / 2 : target.top - topSafe;
  const gh = group.bottom - group.top;
  if (gh <= room) return group.top - topSafe - (room - gh) / 2;
  if (th <= room) return target.bottom - topSafe - room;
  return target.top - Math.max(topSafe, (vh - th) / 2);
}
