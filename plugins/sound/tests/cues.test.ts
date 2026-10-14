import { describe, expect, test } from "bun:test";
import { cueFor, gate, hz, isOn, toStored } from "../cues.ts";

describe("sound cues", () => {
  test("each page event plays its sound", () => {
    expect(cueFor("piece-grabbed", { piece: 3 }, 0.25)).toEqual({ name: "peel", pitch: 0.25 });
    expect(cueFor("piece-dropped", { piece: 3 })).toEqual({ name: "drop" });
    expect(cueFor("case-opened", { id: 1, from: "tile" })).toEqual({ name: "pop" });
    expect(cueFor("service-opened", { id: 1 })).toEqual({ name: "pop" });
    expect(cueFor("case-closed", { id: 1 })).toEqual({ name: "click", pitch: 0.6 }); // a soft click
    expect(cueFor("tile-hovered", { id: 2 })).toEqual({ name: "tick" });
    expect(cueFor("email-copied", {})).toEqual({ name: "copy" });
    expect(cueFor("wall-shuffled", {})).toEqual({ name: "shuffle" });
    expect(cueFor("wall-tidied", {})).toEqual({ name: "sweep" });
    expect(cueFor("whale-launched", { power: 0.7 })).toEqual({ name: "whoosh", pitch: 0.7 });
    expect(cueFor("whale-hit", { piece: 9, points: 0 })).toEqual({ name: "hit", pitch: 0 });
    expect(cueFor("whale-hit", { piece: 1, points: 100 })).toEqual({ name: "hit", pitch: 1 }); // the big one
    expect(cueFor("language-changed", { lang: "en" })).toBeNull();
  });

  test("sound is off unless the visitor turned it on before", () => {
    expect(isOn(null)).toBe(false);
    expect(isOn("0")).toBe(false);
    expect(isOn("yes")).toBe(false);
    expect(isOn("1")).toBe(true);
    expect(isOn(toStored(true))).toBe(true);
    expect(isOn(toStored(false))).toBe(false);
  });

  test("a sound repeats at most once per gap", () => {
    const open = gate();
    expect(open("tick", 1000)).toBe(true);
    expect(open("tick", 1040)).toBe(false); // 55 ms gap
    expect(open("tick", 1056)).toBe(true);
    expect(open("hit", 1000)).toBe(true);
    expect(open("hit", 1080)).toBe(false); // a row of knocked pieces gives one knock
    expect(open("note", 1000)).toBe(true);
    expect(open("note", 1000)).toBe(true); // notes never wait
    expect(open("pop", 1000)).toBe(true);
    expect(open("pop", 1020)).toBe(false);
  });

  test("notes stay in F-sharp major pentatonic", () => {
    expect(hz(0)).toBeCloseTo(185, 0); // F#3
    expect(hz(5)).toBeCloseTo(370, 0); // an octave up
    expect(hz(3)).toBeCloseTo(277.2, 0); // C#4
  });
});
