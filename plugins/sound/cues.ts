// What the page sounds like: which sound each page event plays, how often a sound may repeat,
// and the remembered on/off choice. Pure, so the tests read it without a browser.
import type { PageEvents } from "../../platform/events.ts";
import type { SoundName } from "./api.ts";

export interface Cue {
  name: SoundName;
  pitch?: number;
}

// pitch per sound: peel = x position 0..1, note/roll = scale step, whoosh = power 0..1,
// hit = 1 for a scoring hit, click = loudness and brightness (1 = full).
export function cueFor<K extends keyof PageEvents>(type: K, detail: PageEvents[K], x = 0.5): Cue | null {
  switch (type) {
    case "piece-grabbed":
      return { name: "peel", pitch: x };
    case "piece-dropped":
      return { name: "drop" };
    case "case-opened":
    case "service-opened":
      return { name: "pop" };
    case "case-closed":
      return { name: "click", pitch: 0.6 };
    case "tile-hovered":
      return { name: "tick" };
    case "email-copied":
      return { name: "copy" };
    case "wall-shuffled":
      return { name: "shuffle" };
    case "wall-tidied":
      return { name: "sweep" };
    case "whale-launched":
      return { name: "whoosh", pitch: (detail as PageEvents["whale-launched"]).power };
    case "whale-hit":
      return { name: "hit", pitch: (detail as PageEvents["whale-hit"]).points > 0 ? 1 : 0 };
    default:
      return null;
  }
}

// Every visit starts silent unless the visitor turned sound on before.
export const isOn = (stored: string | null) => stored === "1";
export const toStored = (on: boolean) => (on ? "1" : "0");

// The same sound plays at most once per gap (ms): hovers and knocks come in bursts.
const GAP: Partial<Record<SoundName, number>> = { tick: 55, click: 40, note: 0, roll: 0, hit: 90 };
export function gate() {
  const last = new Map<SoundName, number>();
  return (name: SoundName, now: number) => {
    const prev = last.get(name);
    if (prev !== undefined && now - prev < (GAP[name] ?? 30)) return false;
    last.set(name, now);
    return true;
  };
}

// Notes of the F-sharp major pentatonic from F#3: every sound on the page is in one key.
const SCALE = [0, 2, 4, 7, 9];
export function hz(step: number): number {
  const s = Math.round(step);
  const midi = 54 + SCALE[((s % 5) + 5) % 5] + 12 * Math.floor(s / 5);
  return 440 * 2 ** ((midi - 69) / 12);
}
