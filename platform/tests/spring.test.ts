import { expect, test } from "bun:test";
import { springEasing, springSamples } from "../spring.ts";

test("the spring overshoots about 11 % near 0.27 s and ends at 1", () => {
  const s = springSamples();
  expect(s).toHaveLength(61);
  expect(s[0]).toBe(0);
  expect(s[1]).toBeCloseTo(0.025, 2);
  const peak = Math.max(...s);
  expect(peak).toBeCloseTo(1.114, 2);
  expect(s.indexOf(peak)).toBe(17);
  expect(s[60]).toBe(1);
});

test("browsers without linear() get the bezier fallback", () => {
  expect(springEasing(true).easing.startsWith("linear(0,")).toBe(true);
  expect(springEasing(true).duration).toBe(950);
  expect(springEasing(false)).toEqual({ easing: "cubic-bezier(.34,1.56,.64,1)", duration: 750 });
});
