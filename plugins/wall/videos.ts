// Wall loops: which tile videos get a source and which play.
//
//   near (within one viewport) + 2 s after load  -> attach src (max 3 loading at once)
//   still loading but no longer near              -> drop the source, the slot frees
//   visible + ready                               -> play (max 6, 4 on phones)
//   case open, paused, calm, hidden tab           -> pause all, attach nothing
//   play() refused, error or 20 s without a frame -> poster stays, never retried
//
// schedule() is the pure decision; createVideos() keeps the state and does it.

export interface TileState {
  id: number;
  near: boolean; // within one viewport of the screen
  visible: number; // share of the tile on screen, 0..1
  attached: boolean; // has a source
  loading: boolean; // source attached, not ready to play yet
  ready: boolean;
  playing: boolean;
  failed: boolean;
}

export interface Policy {
  armed: boolean; // 2 s have passed since load
  blocked: boolean; // case open, motion paused or calm, tab hidden
  maxLoading: number;
  maxPlaying: number;
}

export interface Plan {
  attach: number[];
  drop: number[];
  play: number[];
  pause: number[];
}

// Tiles come in wall order; earlier tiles win ties.
export function schedule(tiles: TileState[], p: Policy): Plan {
  if (p.blocked) return { attach: [], drop: [], play: [], pause: tiles.filter((t) => t.playing).map((t) => t.id) };

  // A source still loading for a tile that left the screen's reach gives its slot back.
  const drop = tiles.filter((t) => t.loading && !t.failed && !t.near && !t.visible).map((t) => t.id);
  const attach: number[] = [];
  if (p.armed) {
    const free = p.maxLoading - tiles.filter((t) => t.loading && !t.failed && !drop.includes(t.id)).length;
    const wanted = tiles
      .filter((t) => t.near && !t.attached && !t.failed)
      .map((t, i) => ({ t, i }))
      .sort((a, b) => Number(b.t.visible > 0) - Number(a.t.visible > 0) || a.i - b.i)
      .map(({ t }) => t.id);
    attach.push(...wanted.slice(0, Math.max(0, free)));
  }

  const chosen = tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.visible > 0 && t.ready && !t.failed)
    .sort((a, b) => Number(b.t.playing) - Number(a.t.playing) || b.t.visible - a.t.visible || a.i - b.i)
    .slice(0, p.maxPlaying)
    .map(({ t }) => t.id);
  const play = tiles.filter((t) => chosen.includes(t.id) && !t.playing).map((t) => t.id);
  const pause = tiles.filter((t) => t.playing && !chosen.includes(t.id)).map((t) => t.id);
  return { attach, drop, play, pause };
}

interface Entry {
  state: TileState;
  video: HTMLVideoElement;
  src: { wide: string; phone: string };
  drawing(on: boolean): void;
  stall: number; // timer: a source with no playable frame in 20 s counts as failed
}

const STALL_MS = 20_000;

export function createVideos(opts: { phone: MediaQueryList; blocked: () => boolean }) {
  const entries: Entry[] = [];
  const byEl = new Map<Element, Entry>();
  let armed = false;
  let queued = false;

  const run = () => {
    queued = false;
    const plan = schedule(
      entries.map((e) => e.state),
      { armed, blocked: opts.blocked(), maxLoading: 3, maxPlaying: opts.phone.matches ? 4 : 6 },
    );
    const get = (id: number) => entries.find((e) => e.state.id === id)!;
    for (const id of plan.pause) pause(get(id));
    for (const id of plan.drop) detach(get(id));
    for (const id of plan.attach) attach(get(id));
    for (const id of plan.play) play(get(id));
  };
  const update = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(run);
  };

  const fail = (e: Entry) => {
    e.state.failed = true;
    e.state.loading = e.state.ready = e.state.playing = false;
    e.drawing(false);
    e.video.removeAttribute("src");
    e.video.load();
    update();
  };
  const attach = (e: Entry) => {
    e.state.attached = e.state.loading = true;
    e.video.preload = "auto";
    e.video.src = opts.phone.matches ? e.src.phone : e.src.wide;
    clearTimeout(e.stall);
    e.stall = window.setTimeout(() => e.state.loading && fail(e), STALL_MS);
  };
  const play = (e: Entry) => {
    e.state.playing = true;
    e.video.play().then(
      // On phones the round badge stays a still frame (DESIGN.md, case tile).
      () => e.state.playing && !opts.phone.matches && e.drawing(true),
      (err: unknown) => {
        // A pause that came first is not a failure.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Refused (low-power mode, no autoplay): the poster stays, no retry loop.
        if (e.state.playing) fail(e);
      },
    );
  };
  const pause = (e: Entry) => {
    e.state.playing = false;
    e.drawing(false);
    e.video.pause();
  };
  const detach = (e: Entry) => {
    clearTimeout(e.stall);
    pause(e);
    e.state.attached = e.state.loading = e.state.ready = e.state.failed = false;
    e.video.preload = "none";
    e.video.removeAttribute("src");
    e.video.load();
  };

  const nearIO = new IntersectionObserver(
    (list) => {
      for (const r of list) {
        const e = byEl.get(r.target);
        if (e) e.state.near = r.isIntersecting;
      }
      update();
    },
    { rootMargin: "100%" },
  );
  const seenIO = new IntersectionObserver(
    (list) => {
      for (const r of list) {
        const e = byEl.get(r.target);
        if (e) e.state.visible = r.isIntersecting ? Math.max(r.intersectionRatio, 0.001) : 0;
      }
      update();
    },
    { threshold: [0, 0.01, 0.25, 0.5, 0.75, 1] },
  );

  // Phone and desktop loops are different files: swap them when the breakpoint changes.
  opts.phone.addEventListener("change", () => {
    for (const e of entries) detach(e);
    update();
  });
  document.addEventListener("visibilitychange", update);

  const arm = () => setTimeout(() => ((armed = true), update()), 2000);
  if (document.readyState === "complete") arm();
  else addEventListener("load", arm, { once: true });

  return {
    add(id: number, el: HTMLElement, video: HTMLVideoElement, src: { wide: string; phone: string }, drawing: (on: boolean) => void) {
      const e: Entry = {
        state: { id, near: false, visible: 0, attached: false, loading: false, ready: false, playing: false, failed: false },
        video,
        src,
        drawing,
        stall: 0,
      };
      video.addEventListener("canplay", () => {
        if (!e.state.attached || e.state.failed) return;
        clearTimeout(e.stall);
        e.state.loading = false;
        e.state.ready = true;
        update();
      });
      video.addEventListener("error", () => e.state.attached && fail(e));
      entries.push(e);
      byEl.set(el, e);
      nearIO.observe(el);
      seenIO.observe(el);
    },
    update,
  };
}
