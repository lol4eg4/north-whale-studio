// "*starred*" parts of a manifesto paragraph become highlighter marks. A lone star stays a star.
export interface Run {
  text: string;
  mark: boolean;
}

export function parseMarks(text: string): Run[] {
  const parts = text.split("*");
  // An odd number of stars leaves the last one unpaired: glue it back as plain text.
  if (parts.length % 2 === 0) parts.splice(-2, 2, `${parts.at(-2)}*${parts.at(-1)}`);
  const runs: Run[] = [];
  parts.forEach((part, i) => {
    if (part) runs.push({ text: part, mark: i % 2 === 1 });
  });
  return runs;
}
