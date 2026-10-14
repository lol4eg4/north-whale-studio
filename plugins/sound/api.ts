// Sound's API for the plugins that call it.
export type SoundName = "peel" | "drop" | "click" | "pop" | "note" | "shuffle" | "roll" | "land" | "sweep" | "copy" | "whoosh" | "hit" | "boing" | "tick";

export interface SoundApi {
  play(name: SoundName, pitch?: number): void;
  song(): void;
}
