// Texts and cases: the API every other plugin reads its content from.
import type { Lang } from "../../platform/events.ts";

export type { Lang };
export type TileSize = "xl" | "l" | "t";

export interface CaseItem {
  id: number;
  client: string;
  what: string | null; // what the studio did, only when the studio's file name says it
  result: string | null; // only when the studio's file name says it
  size: TileSize; // wall tile: xl 4x3, l 3x3, t 2x3 (desktop cells)
  kind: "video" | "still";
  sound: boolean;
  vertical: boolean;
  media: {
    tile: string;
    phone: string;
    poster: string;
    posterPhone: string;
    full: string | null; // full video for the open case; null for a still
    still: string | null; // full-size picture for a still case
  };
  ring: [number, number]; // close-up point (0..1) for the round badge
  story: { task: string; did: string; result: string }; // placeholders until the studio sends texts
  sr: string; // what a screen reader says for the tile
}

export interface Service {
  id: number;
  main: boolean;
  title: string;
  phrase: string;
  includes: string[];
}

export interface Member {
  id: number;
  name: string;
  role: string;
  color: string; // token name
  placeholder: true;
}

export interface Client {
  caseId: number;
  name: string;
  shape: "pill" | "circle";
  bg: string; // token name
  fg: string; // token name
  phone: boolean; // also shown on phones
}

export interface Contacts {
  placeholder: true;
  email: string;
  messengers: { name: string; handle: string }[];
  socials: { name: string }[];
}

export interface Placeholder {
  where: string;
  what: string;
}

export interface ContentApi {
  language(): Lang;
  setLanguage(lang: Lang): void;
  text(key: string): string;
  format(key: string, params: Record<string, string | number>): string;
  cases(): CaseItem[];
  caseById(id: number): CaseItem | undefined;
  services(): Service[];
  team(): Member[];
  clients(): Client[];
  contacts(): Contacts;
  placeholders(): Placeholder[];
}
