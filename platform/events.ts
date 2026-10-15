// The page events: the only way plugins act on each other besides APIs and slots.
// Names and fields are fixed by the architecture; adding one is an architecture change.
export type Lang = "ru" | "en";
export type CaseFrom = "tile" | "link" | "dive" | "next";

export interface PageEvents {
  "language-changed": { lang: Lang };
  "case-opened": { id: number; from: CaseFrom };
  "case-closed": { id: number };
  "service-opened": { id: number };
  "tile-hovered": { id: number };
  "email-copied": {};
  "piece-grabbed": { piece: number };
  "piece-dropped": { piece: number };
  "wall-shuffled": {};
  "wall-tidied": {};
  "whale-launched": { power: number };
  "whale-hit": { piece: number; points: number };
}
