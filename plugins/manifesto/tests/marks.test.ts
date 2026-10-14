import { expect, test } from "bun:test";
import ru from "../../content/data/texts.ru.json";
import en from "../../content/data/texts.en.json";
import { parseMarks } from "../marks.ts";

test("the starred part becomes a mark", () => {
  expect(parseMarks("Сначала. *Дизайн из смысла,* а не из шаблона.")).toEqual([
    { text: "Сначала. ", mark: false },
    { text: "Дизайн из смысла,", mark: true },
    { text: " а не из шаблона.", mark: false },
  ]);
});

test("a mark at the start or the end, and no mark at all", () => {
  expect(parseMarks("*all*")).toEqual([{ text: "all", mark: true }]);
  expect(parseMarks("a *b*")).toEqual([
    { text: "a ", mark: false },
    { text: "b", mark: true },
  ]);
  expect(parseMarks("plain")).toEqual([{ text: "plain", mark: false }]);
});

test("a lone star stays a star", () => {
  expect(parseMarks("a *b* c *d")).toEqual([
    { text: "a ", mark: false },
    { text: "b", mark: true },
    { text: " c *d", mark: false },
  ]);
  expect(parseMarks("a * b")).toEqual([{ text: "a * b", mark: false }]);
});

test("every manifesto paragraph has exactly one mark in both languages", () => {
  for (const texts of [ru, en] as Record<string, string>[])
    for (const key of ["mani.p1", "mani.p2", "mani.p3"]) expect(parseMarks(texts[key]).filter((r) => r.mark)).toHaveLength(1);
});
