// The wall's cells in DOM order (the mock's W). The order is what lets dense packing leave
// no holes at 8, 6 and 2 columns: small stickers fill the columns beside every big tile.
// On desktop it reads in bands of three rows, each one or two big cells and a column or block
// of stickers; DeckForge and the clients' sheet close it, so nothing hangs under the last band.
export type Slot =
  | { k: "tile"; id: number; full?: boolean } // full: the whole width on tablet (6 columns), 4 rows high
  | { k: "dive" }
  | { k: "tag"; i: number } // team badge, index into team()
  | { k: "client"; i: number } // index into clients()
  | { k: "tick" }
  | { k: "svc"; id: number; wide?: boolean } // wide: 2 cells across on tablet and desktop, one on phones
  | { k: "svc2"; id: number } // the main service, wide
  | { k: "star" }
  | { k: "team" }
  | { k: "whale" }
  | { k: "telegram" }
  | { k: "sheet" } // the studio's clients as one sheet of logos (the reference's sticker sheet)
  | { k: "deeper" };

export const W: Slot[] = [
  // Waldorf, the dive block and a column of two badges and a client.
  { k: "tile", id: 1 },
  { k: "dive" },
  { k: "tag", i: 0 },
  { k: "tag", i: 1 },
  { k: "client", i: 0 },
  // AG1, Dear Passengers and a column: the starburst, a client, a badge.
  { k: "tile", id: 2 },
  { k: "tile", id: 3 },
  { k: "star" },
  { k: "client", i: 1 },
  { k: "tag", i: 2 },
  { k: "tick" },
  // Mabrook beside a block of the services, a client, the whale, Telegram and «Ныряй глубже».
  { k: "tile", id: 4 },
  { k: "svc2", id: 1 },
  { k: "svc", id: 2, wide: true },
  { k: "svc", id: 3 },
  { k: "svc", id: 4 },
  { k: "client", i: 2 },
  { k: "whale" },
  { k: "svc", id: 5, wide: true },
  { k: "telegram" },
  { k: "deeper" },
  { k: "tile", id: 5, full: true },
  { k: "tile", id: 6 },
  // Antiquerus, the team block and two columns: the last badge and five clients.
  { k: "tile", id: 7 },
  { k: "team" },
  { k: "tag", i: 3 },
  { k: "client", i: 3 },
  { k: "client", i: 4 },
  { k: "client", i: 5 },
  { k: "client", i: 6 },
  { k: "client", i: 7 },
  // DeckForge and the clients' sheet close the wall.
  { k: "tile", id: 8 },
  { k: "sheet" },
];

// Same tilt on every visit: mulberry32 seeded 21, one draw per sticker in DOM order, ±7 deg.
export function tilts(count: number, seed = 21): number[] {
  let s = seed;
  const next = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => Math.round((next() - 0.5) * 14 * 10) / 10);
}

export const isSticker = (s: Slot) => !["tile", "dive", "tick", "team", "sheet"].includes(s.k);

// The "Напишите нам" starburst: 28 points alternating radius 47 and 40 around (50,50).
export function starPoints(): string {
  const p: string[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = i % 2 ? 40 : 47;
    p.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`);
  }
  return p.join(" ");
}

// Service sticker colours (token names) by service id; the main one is the ink wide sticker.
export const SERVICE_COLORS: Record<number, [string, string]> = {
  2: ["jellyfish", "ink"],
  3: ["lemon", "ink"],
  4: ["buoy", "ink"],
  5: ["cobalt", "paper"],
};
