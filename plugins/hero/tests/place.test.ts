import { describe, expect, test } from "bun:test";
import { clippingPlace } from "../place.ts";

// A 1000 x 600 hero with 20 px padding on top and 30 px on the right; a 200 x 100 clipping.
const hero = { left: 0, right: 1000, top: 0, bottom: 600 };
const box = { width: 200, height: 100 };
const at = (taken: { left: number; right: number; top: number; bottom: number }[], h = hero) => clippingPlace(h, 20, 30, box, taken);

describe("the Forbes clipping's spot", () => {
  test("nothing in the way: the hero's top right corner, inside its padding", () => {
    expect(at([])).toEqual({ left: 770, top: 20 });
  });

  test("a word in the corner: the first spot 10 px under it", () => {
    expect(at([{ left: 700, right: 1000, top: 0, bottom: 150 }])).toEqual({ left: 770, top: 160 });
  });

  test("keeps 10 px off a word on its left, and ignores one farther away", () => {
    expect(at([{ left: 0, right: 765, top: 0, bottom: 150 }])).toEqual({ left: 770, top: 160 });
    expect(at([{ left: 0, right: 759, top: 0, bottom: 150 }])).toEqual({ left: 770, top: 20 });
  });

  test("a gap between two words, only if it is tall enough", () => {
    const first = { left: 700, right: 1000, top: 0, bottom: 100 };
    const next = { left: 700, right: 1000, top: 230, bottom: 300 };
    // 100 px of clipping and 10 px each side fit between 100 and 230.
    expect(at([first, next])).toEqual({ left: 770, top: 112 });
    // They do not between 100 and 200: under the second word.
    expect(at([first, { ...next, top: 200 }])).toEqual({ left: 770, top: 312 });
  });

  test("never below the hero: no spot is null, and the clipping goes to the buttons", () => {
    expect(at([{ left: 700, right: 1000, top: 0, bottom: 495 }])).toBeNull();
    expect(at([{ left: 0, right: 1000, top: 0, bottom: 600 }])).toBeNull();
    expect(at([], { ...hero, bottom: 110 })).toBeNull();
  });

  test("the spot is measured from the hero's own corner, wherever the hero is on the page", () => {
    expect(at([], { left: 100, right: 1100, top: 50, bottom: 650 })).toEqual({ left: 770, top: 20 });
  });
});
