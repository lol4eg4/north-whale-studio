// The footer slogan, one entry per letter (T§4.12): hover colour cycles five tokens, hover
// turn ((i % 3) - 1) * 8 deg, and the mock's resting tilt (every 3rd -4 deg, every 5th +3 deg
// and a little higher), counted over all characters like the mock's :nth-child.
export interface Letter {
  ch: string;
  space: boolean;
  note: number; // index among the letters (spaces skipped): sound note and colour step
  colour: string;
  turn: number; // hover rotation, deg
  tilt: number; // resting rotation (--r), deg
  up: boolean;
}

const COLOURS = ["--cobalt", "--buoy", "--jellyfish", "--mint", "--lemon"];

function graphemes(text: string): string[] {
  const t = text.normalize("NFC");
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t)].map((s) => s.segment);
  return Array.from(t);
}

export function splitLetters(text: string): Letter[] {
  let note = 0;
  return graphemes(text.trim()).map((ch, i) => {
    const nth = i + 1;
    const space = /^\s+$/.test(ch);
    const fifth = nth % 5 === 0;
    const letter: Letter = {
      ch,
      space,
      note: space ? -1 : note,
      colour: space ? "" : `var(${COLOURS[note % 5]})`,
      turn: space ? 0 : ((note % 3) - 1) * 8,
      tilt: fifth ? 3 : nth % 3 === 0 ? -4 : 0,
      up: fifth,
    };
    if (!space) note++;
    return letter;
  });
}
