// Open case's API for the plugins that call it.
import type { CaseFrom } from "../../platform/events.ts";

export interface CaseApi {
  open(id: number, from: CaseFrom, opener?: HTMLElement | null): void;
  close(): void;
}
