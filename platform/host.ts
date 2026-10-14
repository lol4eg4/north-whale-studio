// The host every plugin gets: APIs by name, page events, regions of the frame, slots.
//
//   boot: init every plugin (layer 0..3, then app order) -> resolve slots -> ready callbacks
//
// Inits only provide APIs, build their DOM and subscribe. Calls into another plugin's API
// happen later, in handlers or ready(), so the order of inits inside a layer never matters.
import type { PageEvents } from "./events.ts";
import type { Memory } from "./memory.ts";
import type { Motion } from "./motion.ts";

export type RegionName =
  | "nav-lang"
  | "menu-lang"
  | "menu-foot"
  | "main"
  | "footer"
  | "finale"
  | "corner-left"
  | "corner-right"
  | "overlay";
export type SlotName = "wall-dive" | "wall-hint";

export interface Host {
  provide<T extends object>(name: string, api: T): void;
  use<T>(name: string): T;
  on<K extends keyof PageEvents>(type: K, fn: (detail: PageEvents[K]) => void): () => void;
  emit<K extends keyof PageEvents>(type: K, detail: PageEvents[K]): void;
  region(name: RegionName): HTMLElement;
  slot(name: SlotName, place: HTMLElement, fallback: (place: HTMLElement) => void): void;
  fill(name: SlotName, render: (place: HTMLElement) => void): void;
  ready(fn: () => void): void;
  readonly motion: Motion;
  readonly memory: Memory;
}

export type PluginInit = (host: Host) => void;
export interface LoadedPlugin {
  name: string;
  layer: number;
  init: PluginInit;
}

export function createHost(regions: Partial<Record<RegionName, HTMLElement>>, motion: Motion, memory: Memory) {
  const apis = new Map<string, object>();
  const listeners = new Map<string, Set<(detail: never) => void>>();
  const slots = new Map<SlotName, { place: HTMLElement; fallback: (place: HTMLElement) => void }>();
  const fills = new Map<SlotName, (place: HTMLElement) => void>();
  const readyFns: (() => void)[] = [];

  const host: Host = {
    motion,
    memory,
    provide(name, api) {
      if (apis.has(name)) throw new Error(`Plugin API "${name}" is provided twice`);
      apis.set(name, api);
    },
    use<T>(name: string): T {
      const api = apis.get(name);
      if (!api) throw new Error(`Plugin API "${name}" is not provided`);
      return api as T;
    },
    on(type, fn) {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(fn as (detail: never) => void);
      return () => set!.delete(fn as (detail: never) => void);
    },
    emit(type, detail) {
      for (const fn of [...(listeners.get(type) ?? [])]) {
        try {
          (fn as (d: typeof detail) => void)(detail);
        } catch (e) {
          console.error(`A "${type}" listener failed`, e);
        }
      }
    },
    region(name) {
      const el = regions[name];
      if (!el) throw new Error(`The frame has no region "${name}"`);
      return el;
    },
    slot(name, place, fallback) {
      slots.set(name, { place, fallback });
    },
    fill(name, render) {
      fills.set(name, render);
    },
    ready(fn) {
      readyFns.push(fn);
    },
  };

  function boot(plugins: LoadedPlugin[]) {
    for (const p of plugins) {
      try {
        p.init(host);
      } catch (e) {
        console.error(`Plugin "${p.name}" failed to start`, e);
      }
    }
    for (const [name, { place, fallback }] of slots) (fills.get(name) ?? fallback)(place);
    for (const fn of readyFns) {
      try {
        fn();
      } catch (e) {
        console.error("A ready callback failed", e);
      }
    }
  }

  return { host, boot };
}
