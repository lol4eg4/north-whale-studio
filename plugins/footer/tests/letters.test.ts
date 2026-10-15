import { expect, test } from "bun:test";
import { splitLetters } from "../letters.ts";

test("one entry per character, spaces kept but not counted as notes", () => {
  const letters = splitLetters("Ныряй глубже");
  expect(letters.map((l) => l.ch).join("")).toBe("Ныряй глубже");
  expect(letters).toHaveLength(12);
  expect(letters[5]).toMatchObject({ ch: " ", space: true, note: -1 });
  expect(letters.filter((l) => !l.space).map((l) => l.note)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("й written as и + breve stays one letter", () => {
  const letters = splitLetters("Ныряй");
  expect(letters).toHaveLength(5);
  expect(letters[4].ch).toBe("\u0439");
});

test("colours cycle five tokens, hover turns cycle -8/0/8 deg", () => {
  const letters = splitLetters("Dive deeper").filter((l) => !l.space);
  expect(letters.slice(0, 6).map((l) => l.colour)).toEqual(["var(--cobalt)", "var(--buoy)", "var(--jellyfish)", "var(--mint)", "var(--lemon)", "var(--cobalt)"]);
  expect(letters.slice(0, 4).map((l) => l.turn)).toEqual([-8, 0, 8, -8]);
});

test("the mock's tilt: every 3rd character -4 deg, every 5th +3 deg and raised", () => {
  const letters = splitLetters("НЫРЯЙ ГЛУБЖЕ");
  expect(letters.map((l) => l.tilt)).toEqual([0, 0, -4, 0, 3, -4, 0, 0, -4, 3, 0, -4]);
  expect(letters.map((l, i) => (l.up ? i : -1)).filter((i) => i >= 0)).toEqual([4, 9]);
});

test("leading and trailing spaces are dropped", () => {
  expect(splitLetters("  ab ").map((l) => l.ch)).toEqual(["a", "b"]);
});
