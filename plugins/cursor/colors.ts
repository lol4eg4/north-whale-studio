// Cursor label colours (T§4.11 with the site's tokens). Owners write the translated label into
// data-cursor; the cursor finds which key that label is and paints the pill for it.
export const CURSOR_KEYS = ["open", "drag", "dragging", "write", "close", "pull", "dive", "spin", "tidy", "meet", "play", "hi"] as const;
export type CursorKey = (typeof CURSOR_KEYS)[number];

export interface Colors {
  bg: string;
  fg: string;
}

export function cursorColors(key: CursorKey | undefined): Colors {
  switch (key) {
    case "open":
    case "close":
      return { bg: "var(--ink)", fg: "var(--paper)" };
    case "drag":
    case "dragging":
    case "pull":
    case "tidy":
      return { bg: "var(--buoy)", fg: "var(--ink)" };
    case "write":
    case "hi":
    case "meet":
    case "play":
      return { bg: "var(--jellyfish)", fg: "var(--ink)" };
    case "dive":
    case "spin":
      return { bg: "var(--cobalt)", fg: "var(--paper)" };
    default:
      return { bg: "var(--paper)", fg: "var(--ink)" };
  }
}

// Label text -> key, for the current language.
export function labelKeys(text: (key: string) => string): Map<string, CursorKey> {
  return new Map(CURSOR_KEYS.map((k) => [text(`cursor.${k}`), k]));
}

// Only a mouse-like pointer gets the custom cursor; touch screens never do.
export const wantsCursor = (finePointer: boolean, maxTouchPoints: number) => finePointer && maxTouchPoints === 0;
