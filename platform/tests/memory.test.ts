import { expect, test } from "bun:test";
import { createMemory } from "../memory.ts";

test("memory keeps values under the nws. prefix", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as Storage;
  const memory = createMemory(() => storage);
  memory.set("lang", "en");
  expect(store.get("nws.lang")).toBe("en");
  expect(memory.get("lang")).toBe("en");
});

test("blocked storage means no memory, never an error", () => {
  const memory = createMemory(() => {
    throw new DOMException("denied", "SecurityError");
  });
  expect(() => memory.set("lang", "en")).not.toThrow();
  expect(memory.get("lang")).toBeNull();
});
