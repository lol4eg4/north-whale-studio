// Sound's API for the plugins that call it.
export type SoundName = "peel" | "drop" | "click" | "pop" | "shuffle" | "land" | "sweep" | "copy" | "whoosh" | "hit" | "boing" | "tick";

export interface SoundApi {
  play(name: SoundName, pitch?: number): void;
  toggle(): void; // Plan B: site sound on (the music starts) or off, like the sound button
}
