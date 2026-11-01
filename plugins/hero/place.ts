// Where the Forbes clipping sits on the first screen. Pure decision; index.ts measures and moves it.
export type Box = { left: number; right: number; top: number; bottom: number };

// The highest free spot at the hero's right edge, mostly beside the headline. It keeps `gap` px off
// every word, the note and the buttons, and stays inside the hero.
// null: no such spot, it goes beside the buttons, in their row.
export function clippingPlace(hero: Box, padTop: number, padRight: number, box: { width: number; height: number }, taken: Box[], gap = 10) {
  const x = hero.right - padRight - box.width;
  for (let y = hero.top + padTop; y + box.height <= hero.bottom; y += 4) {
    const hit = taken.some((r) => x < r.right + gap && x + box.width > r.left - gap && y < r.bottom + gap && y + box.height > r.top - gap);
    if (!hit) return { left: x - hero.left, top: y - hero.top };
  }
  return null;
}
