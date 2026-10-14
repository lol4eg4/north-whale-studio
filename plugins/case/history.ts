// Case history model: the address hash is the truth. Pure decisions; index.ts carries them out.
//
//   open from the page   pushState #case-N            (replaceState when a case is already open)
//   Next                 replaceState #case-(N+1), 8 -> 1
//   load with #case-N    replaceState(no hash), pushState #case-N, open from "link"
//   Back / hash change   valid #case-N opens, anything else closes
//   close                our own entry -> history.back(); else replaceState #cases
//   unknown #case-*      replace with #cases and show the wall
import type { CaseFrom } from "../../platform/events.ts";

export type Act =
  | { t: "push"; id: number } // pushState({nwsCase: id}, path + search + "#case-id")
  | { t: "replace"; hash: string; id?: number } // replaceState(path + search + hash); id keeps our entry's mark
  | { t: "back" }
  | { t: "show"; id: number; from: CaseFrom }
  | { t: "hide" }
  | { t: "wall" }; // replace the address with #cases and bring the wall into view

export interface Ctx {
  open: number | null;
  closing: boolean; // waiting for the popstate of our history.back()
  ids: number[];
}

export function parseHash(hash: string, ids: number[]): number | "unknown" | null {
  const m = /^#case-(.*)$/.exec(hash);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NaN;
  return ids.includes(n) ? n : "unknown";
}

export const nextId = (id: number, ids: number[]) => ids[(ids.indexOf(id) + 1) % ids.length];

export const isOurEntry = (state: unknown) => typeof state === "object" && state !== null && "nwsCase" in state;

export function onLoad(hash: string, ctx: Ctx): Act[] {
  const v = parseHash(hash, ctx.ids);
  if (v === null) return [];
  if (v === "unknown") return [{ t: "wall" }];
  return [{ t: "replace", hash: "" }, { t: "push", id: v }, { t: "show", id: v, from: "link" }];
}

export function onOpen(id: number, from: CaseFrom, ctx: Ctx): Act[] {
  if (!ctx.ids.includes(id) || ctx.closing || ctx.open === id) return [];
  const address: Act = ctx.open === null ? { t: "push", id } : { t: "replace", hash: `#case-${id}`, id };
  return [address, { t: "show", id, from }];
}

export function onNext(ctx: Ctx): Act[] {
  if (ctx.open === null || ctx.closing) return [];
  const id = nextId(ctx.open, ctx.ids);
  return [{ t: "replace", hash: `#case-${id}`, id }, { t: "show", id, from: "next" }];
}

export function onRequestClose(ctx: Ctx, state: unknown): Act[] {
  if (ctx.open === null || ctx.closing) return [];
  if (isOurEntry(state)) return [{ t: "back" }];
  return [{ t: "replace", hash: "#cases" }, { t: "hide" }];
}

export function onNavigate(hash: string, ctx: Ctx): Act[] {
  const v = parseHash(hash, ctx.ids);
  if (typeof v === "number") return ctx.open === v && !ctx.closing ? [] : [{ t: "show", id: v, from: "link" }];
  const acts: Act[] = ctx.open !== null ? [{ t: "hide" }] : [];
  if (v === "unknown") acts.push({ t: "wall" });
  return acts;
}
