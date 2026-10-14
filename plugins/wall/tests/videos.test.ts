import { describe, expect, test } from "bun:test";
import { schedule, type Policy, type TileState } from "../videos.ts";

const tile = (id: number, s: Partial<TileState> = {}): TileState => ({
  id,
  near: false,
  visible: 0,
  attached: false,
  loading: false,
  ready: false,
  playing: false,
  failed: false,
  ...s,
});
const policy = (p: Partial<Policy> = {}): Policy => ({ armed: true, blocked: false, maxLoading: 3, maxPlaying: 6, ...p });

describe("attaching sources", () => {
  test("nothing before the 2 s mark", () => {
    const tiles = [tile(1, { near: true, visible: 1 }), tile(2, { near: true })];
    expect(schedule(tiles, policy({ armed: false })).attach).toEqual([]);
  });

  test("only tiles near the screen, at most 3 loading at once, visible ones first", () => {
    const tiles = [
      tile(1, { near: true }),
      tile(2, { near: true, visible: 0.5 }),
      tile(3, { near: true }),
      tile(4, { near: true }),
      tile(5),
    ];
    expect(schedule(tiles, policy()).attach).toEqual([2, 1, 3]);
    const busy = [tile(1, { near: true, attached: true, loading: true }), tile(2, { near: true, attached: true, loading: true }), tile(3, { near: true }), tile(4, { near: true })];
    expect(schedule(busy, policy()).attach).toEqual([3]);
  });

  test("a tile still loading that left the screen's reach is dropped and frees its slot", () => {
    const tiles = [
      tile(1, { attached: true, loading: true }),
      tile(2, { near: true, attached: true, loading: true }),
      tile(3, { near: true, attached: true, loading: true }),
      tile(4, { near: true }),
    ];
    const plan = schedule(tiles, policy());
    expect(plan.drop).toEqual([1]);
    expect(plan.attach).toEqual([4]);
  });

  test("attached or failed tiles are never attached again", () => {
    const tiles = [tile(1, { near: true, attached: true, ready: true }), tile(2, { near: true, failed: true })];
    expect(schedule(tiles, policy()).attach).toEqual([]);
  });
});

describe("playing", () => {
  test("only visible ready tiles play", () => {
    const tiles = [tile(1, { visible: 1, ready: true, attached: true }), tile(2, { visible: 0, ready: true, attached: true }), tile(3, { visible: 0.4, attached: true, loading: true })];
    expect(schedule(tiles, policy())).toEqual({ attach: [], drop: [], play: [1], pause: [] });
  });

  test("a tile that leaves the screen pauses", () => {
    const tiles = [tile(1, { visible: 0, ready: true, attached: true, playing: true })];
    expect(schedule(tiles, policy()).pause).toEqual([1]);
  });

  test("cap: 6 on desktop, 4 on phones; playing tiles keep their turn", () => {
    const many = Array.from({ length: 8 }, (_, i) => tile(i + 1, { visible: 1, ready: true, attached: true }));
    expect(schedule(many, policy()).play).toEqual([1, 2, 3, 4, 5, 6]);
    expect(schedule(many, policy({ maxPlaying: 4 })).play).toEqual([1, 2, 3, 4]);
    const some = many.map((t) => ({ ...t, playing: t.id >= 5 }));
    const plan = schedule(some, policy({ maxPlaying: 4 }));
    expect(plan.play).toEqual([]);
    expect(plan.pause).toEqual([]);
  });

  test("failed tiles keep the poster and never play", () => {
    const tiles = [tile(1, { visible: 1, ready: false, failed: true, attached: true })];
    expect(schedule(tiles, policy())).toEqual({ attach: [], drop: [], play: [], pause: [] });
  });

  test("blocked (case open, paused, calm, hidden tab): pause everything, attach nothing", () => {
    const tiles = [
      tile(1, { visible: 1, ready: true, attached: true, playing: true }),
      tile(2, { visible: 1, ready: true, attached: true }),
      tile(3, { near: true }),
    ];
    expect(schedule(tiles, policy({ blocked: true }))).toEqual({ attach: [], drop: [], play: [], pause: [1] });
  });
});
