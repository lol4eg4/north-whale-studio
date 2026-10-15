import { describe, expect, test } from "bun:test";
import { createHost } from "../host.ts";
import type { Memory } from "../memory.ts";
import type { Motion } from "../motion.ts";

const make = () => createHost({ main: {} as HTMLElement }, {} as Motion, {} as Memory);

describe("host", () => {
  test("provide and use an API; a missing API is a clear error", () => {
    const { host } = make();
    host.provide("case", { open: () => 1 });
    expect(host.use<{ open(): number }>("case").open()).toBe(1);
    expect(() => host.use("sound")).toThrow('Plugin API "sound" is not provided');
    expect(() => host.provide("case", {})).toThrow("provided twice");
  });

  test("events reach listeners until they unsubscribe; one failing listener does not stop others", () => {
    const { host } = make();
    const seen: number[] = [];
    const errors = console.error;
    console.error = () => {};
    host.on("case-opened", () => {
      throw new Error("boom");
    });
    const off = host.on("case-opened", (d) => seen.push(d.id));
    host.emit("case-opened", { id: 3, from: "tile" });
    off();
    host.emit("case-opened", { id: 4, from: "tile" });
    console.error = errors;
    expect(seen).toEqual([3]);
  });

  test("a slot shows its filler, or its fallback when nobody fills it; ready runs after", () => {
    const { host, boot } = make();
    const order: string[] = [];
    const dive = { id: "dive" } as unknown as HTMLElement;
    const hint = { id: "hint" } as unknown as HTMLElement;
    boot([
      {
        name: "wall",
        layer: 1,
        init: (h) => {
          h.slot("wall-dive", dive, () => order.push("dive fallback"));
          h.slot("wall-hint", hint, () => order.push("hint fallback"));
          h.ready(() => order.push("ready"));
        },
      },
      { name: "drag", layer: 2, init: (h) => h.fill("wall-hint", (place) => order.push(`hint filled ${place.id}`)) },
    ]);
    expect(order).toEqual(["dive fallback", "hint filled hint", "ready"]);
    expect(host.region("main")).toBeDefined();
    expect(() => host.region("finale")).toThrow('no region "finale"');
  });

  test("a plugin that fails to start does not stop the others", () => {
    const { boot } = make();
    const started: string[] = [];
    const errors = console.error;
    console.error = () => {};
    boot([
      { name: "a", layer: 1, init: () => { throw new Error("broken"); } },
      { name: "b", layer: 1, init: () => { started.push("b"); } },
    ]);
    console.error = errors;
    expect(started).toEqual(["b"]);
  });

  test("a slot fill that throws does not stop the other slots or the ready callbacks", () => {
    const { boot } = make();
    const order: string[] = [];
    const errors = console.error;
    console.error = () => {};
    boot([
      {
        name: "wall",
        layer: 1,
        init: (h) => {
          h.slot("wall-dive", {} as HTMLElement, () => order.push("dive fallback"));
          h.slot("wall-hint", {} as HTMLElement, () => order.push("hint fallback"));
          h.ready(() => order.push("ready"));
        },
      },
      {
        name: "dive",
        layer: 2,
        init: (h) =>
          h.fill("wall-dive", () => {
            throw new Error("broken fill");
          }),
      },
    ]);
    console.error = errors;
    expect(order).toEqual(["hint fallback", "ready"]);
  });

  test("a ready callback that throws does not stop the next one", () => {
    const { boot } = make();
    const order: string[] = [];
    const errors = console.error;
    console.error = () => {};
    boot([
      {
        name: "a",
        layer: 1,
        init: (h) => {
          h.ready(() => order.push("first"));
          h.ready(() => {
            throw new Error("broken ready");
          });
          h.ready(() => order.push("third"));
        },
      },
    ]);
    console.error = errors;
    expect(order).toEqual(["first", "third"]);
  });
});
