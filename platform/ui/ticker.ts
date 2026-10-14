// Ticker on a strip of tape: a label tag and a row of words that drifts left forever.
// Two identical copies make the loop seamless; the second is hidden from screen readers.
// The row moves only while the owner sets class "run" (calm and paused stop it in CSS).
import { h } from "./parts.ts";
import "./ticker.css";

// Each copy repeats the words so one copy is wider than the widest wall (1680 px).
const SETS = 2;

export function ticker(label: string, words: string[]) {
  const tag = h("span", { class: "ticker-lbl" });
  const row = h("div", { class: "ticker-row" });
  const el = h("div", { class: "ticker", role: "region" }, tag, row);

  const copy = (hidden: boolean) =>
    h(
      "span",
      { class: "ticker-copy", "aria-hidden": hidden ? "true" : null },
      ...Array.from({ length: SETS }, () => words.flatMap((w) => [h("span", { class: "ticker-w" }, w), h("span", { class: "ticker-star", "aria-hidden": "true" })])).flat(),
    );

  const set = (nextLabel: string, nextWords: string[]) => {
    label = nextLabel;
    words = nextWords;
    tag.textContent = label;
    el.setAttribute("aria-label", label);
    row.replaceChildren(copy(false), copy(true));
  };
  set(label, words);
  return { el, set };
}
