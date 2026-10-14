import { expect, test } from "bun:test";
import { binder } from "../text-binder.ts";

test("bound text and attributes follow the language", () => {
  let lang = "ru";
  const words: Record<string, Record<string, string>> = { ru: { hi: "Привет" }, en: { hi: "Hello" } };
  const t = binder((key) => words[lang][key]);
  const attrs: Record<string, string> = {};
  const el = { textContent: "" } as Element;
  const btn = { setAttribute: (k: string, v: string) => (attrs[k] = v) } as unknown as Element;
  t.bind(el, "hi");
  t.bind(btn, "hi", "aria-label");
  expect(el.textContent).toBe("Привет");
  lang = "en";
  t.refresh();
  expect(el.textContent).toBe("Hello");
  expect(attrs["aria-label"]).toBe("Hello");
});
