import { expect, test } from "bun:test";

test("tokens.css carries every DESIGN.md colour with the same value", async () => {
  const design = await Bun.file(`${import.meta.dir}/../DESIGN.md`).text();
  const front = Bun.YAML.parse(design.split(/^---$/m)[1]) as { colors: Record<string, string> };
  const css = await Bun.file(`${import.meta.dir}/../platform/ui/tokens.css`).text();
  for (const [name, value] of Object.entries(front.colors)) {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]+);`));
    expect(m?.[1]?.toUpperCase(), name).toBe(value.toUpperCase());
  }
});
