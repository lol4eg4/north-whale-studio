import { describe, expect, test } from "bun:test";
import { cursorColors, labelKeys, wantsCursor } from "../colors.ts";

describe("cursor", () => {
  test("label colours follow the key", () => {
    expect(cursorColors("open")).toEqual({ bg: "var(--ink)", fg: "var(--paper)" });
    expect(cursorColors("close")).toEqual({ bg: "var(--ink)", fg: "var(--paper)" });
    for (const k of ["drag", "pull", "tidy", "dragging"] as const) expect(cursorColors(k)).toEqual({ bg: "var(--buoy)", fg: "var(--ink)" });
    for (const k of ["write", "hi", "meet", "play"] as const) expect(cursorColors(k)).toEqual({ bg: "var(--jellyfish)", fg: "var(--ink)" });
    for (const k of ["dive", "spin"] as const) expect(cursorColors(k)).toEqual({ bg: "var(--cobalt)", fg: "var(--paper)" });
    expect(cursorColors(undefined)).toEqual({ bg: "var(--paper)", fg: "var(--ink)" });
  });

  test("a translated label finds its key in the current language", () => {
    const ru: Record<string, string> = { "cursor.open": "смотреть", "cursor.pull": "тяни", "cursor.dive": "ныряй", "cursor.spin": "крути" };
    const keys = labelKeys((k) => ru[k] ?? k);
    expect(keys.get("смотреть")).toBe("open");
    expect(keys.get("тяни")).toBe("pull");
    expect(keys.get("ныряй")).toBe("dive");
    expect(keys.get("крути")).toBe("spin");
    expect(keys.get("watch")).toBeUndefined();
  });

  test("only a mouse-like pointer without touch gets the custom cursor", () => {
    expect(wantsCursor(true, 0)).toBe(true);
    expect(wantsCursor(true, 5)).toBe(false); // touch laptop
    expect(wantsCursor(false, 0)).toBe(false);
  });
});
