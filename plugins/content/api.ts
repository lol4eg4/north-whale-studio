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
  color: string; // token name: the open case's own colour
  press: Press[]; // publications that wrote about the client: "As seen in" on the tile, cards in the case
  logos: Logo[]; // a logo row under the case results: DeckForge's partners, Dear Passengers' platforms
  media: {
    poster: string; // the tile's still
    posterPhone: string; // used at <= 700 px
    ring: string | null; // the round badge's loop; null for a still
    ringPoster: string; // the badge's still until the loop plays
    full: string | null; // full video for the open case; null for a still
    still: string | null; // full-size picture for a still case
  };
  story: { task: string; did: string; result: string }; // placeholders, for a case with no page yet
  page: CasePage | null; // the studio's own case text (data/pages.*.json)
  sr: string; // what a screen reader says for the tile
}

export interface Logo {
  name: string;
  logo: string; // drawn in one colour through a CSS mask
  ratio: number; // logo width / height
  scale: number; // a logo with small letters (a script wordmark) draws taller
}

export interface Press extends Logo {
  title: string; // the article's own headline, in its own language
  url: string;
}

// One case told the way the reference tells it. Text may mark ==highlights==.
export interface CasePage {
  eyebrow: string; // the title under it is the client, as on the tile
  client: string;
  category: string;
  lead: string;
  media: string; // label on the video
  sections: { title: string; kicker: string | null; text: string[] }[]; // how we built it; some cases tell it in two parts
  card: { label: string; headline: string; copy: string; hand: string } | null;
  role: { items: string[]; deliverables: string };
  results: { items: { value: string; label: string }[]; note: string | null; logos: string | null } | null; // logos: the label over the case's logo row
  links: { label: string; url: string }[];
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
  photo: string; // square picture; the poster still when there is a video
  video: string | null; // short silent loop instead of the photo
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
  email: string;
  messengers: { name: string; handle: string; url?: string }[];
  socials: { name: string }[];
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
  brands(): Logo[]; // the studio's clients beyond the cases: the sheet of logos on the wall
  contacts(): Contacts;
}
