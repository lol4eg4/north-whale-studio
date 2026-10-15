// Open case's API for the plugins that call it.
import type { CaseFrom } from "../../platform/events.ts";

export interface CaseApi {
  open(id: number, from: CaseFrom, opener?: HTMLElement | null): void;
  close(): void;
  // The wall tells where each case's tile is, so focus can go back to it after Next or a link.
  setTile?(id: number, tile: HTMLElement): void;
}
