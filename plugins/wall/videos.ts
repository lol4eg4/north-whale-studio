// Wall loops (the case tiles' round badges, Maria's badge): which get a source and which play.
//
//   near (within one viewport) + 2 s after load  -> attach src (max 3 loading at once)
//   still loading but no longer near              -> drop the source, the slot frees
//   visible + ready                               -> play (max 6, 4 on phones)
//   case open, pause button on, hidden tab        -> pause all, attach nothing
//   play() refused                                -> poster stays until the next tap, click or key
//   refused after 3 such gestures, or an error    -> poster stays, never retried
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
  blocked: boolean; // case open, pause button on, tab hidden
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
  still?: () => boolean; // this loop alone stays still now: it is treated as off screen
  video: HTMLVideoElement;
  src: string;
  stall: number; // timer: a source that brings no data for 20 s gives its slot back
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
      entries.map((e) => (e.still?.() ? { ...e.state, near: false, visible: 0 } : e.state)),
      { armed, blocked: opts.blocked(), maxLoading: 3, maxPlaying: opts.phone.matches ? 4 : 6 },
    );
    const get = (id: number) => entries.find((e) => e.state.id === id)!;
    for (const id of plan.pause) pause(get(id));
    for (const id of plan.drop) detach(get(id));
    for (const id of plan.attach) attach(get(id));
    if (!refused) for (const id of plan.play) play(get(id));
  };
  const update = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(run);
  };

  const fail = (e: Entry) => {
    e.state.failed = true;
    e.state.loading = e.state.ready = e.state.playing = false;
    e.video.removeAttribute("src");
    e.video.load();
    update();
  };
  const attach = (e: Entry) => {
    e.state.attached = e.state.loading = true;
    e.video.preload = "auto";
    e.video.src = e.src;
    watch(e);
  };
  // Autoplay refused (an iPhone in Low Power Mode): every loop waits for the visitor's next tap,
  // click or key, and plays from inside it, where the browser allows it. A swipe or a modifier key
  // may not count as one, so the loops give up only after 3 gestures in a row that the browser
  // refused too; a loop that plays starts the count again.
  const GESTURE_TRIES = 3;
  let refused = false;
  let tries = 0;
  const play = (e: Entry) => {
    e.state.playing = true;
    e.video.play().then(() => void (tries = 0), (err: unknown) => {
      // A pause that came first is not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!e.state.playing) return;
      if (err instanceof DOMException && err.name === "NotAllowedError" && tries < GESTURE_TRIES) {
        e.state.playing = false;
        refused = true;
        return;
      }
      // Broken, or refused even after the gestures: the poster stays, no retry loop.
      fail(e);
    });
  };
  const gesture = () => {
    if (!refused) return;
    refused = false;
    tries++;
    run();
  };
  for (const type of ["pointerup", "touchend", "keydown"]) addEventListener(type, gesture, true);
  // No data for 20 s: the slot goes back and the tile tries again later (a slow link keeps going
  // as long as data comes).
  const watch = (e: Entry) => {
    clearTimeout(e.stall);
    e.stall = window.setTimeout(() => {
      if (!e.state.loading) return;
      detach(e);
      update();
    }, STALL_MS);
  };
  const pause = (e: Entry) => {
    e.state.playing = false;
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

  document.addEventListener("visibilitychange", update);

  const arm = () => setTimeout(() => ((armed = true), update()), 2000);
  if (document.readyState === "complete") arm();
  else addEventListener("load", arm, { once: true });

  return {
    add(id: number, el: HTMLElement, video: HTMLVideoElement, src: string, still?: () => boolean) {
      const e: Entry = {
        state: { id, near: false, visible: 0, attached: false, loading: false, ready: false, playing: false, failed: false },
        still,
        video,
        src,
        stall: 0,
      };
      video.addEventListener("canplay", () => {
        if (!e.state.attached || e.state.failed) return;
        clearTimeout(e.stall);
        e.state.loading = false;
        e.state.ready = true;
        update();
      });
      video.addEventListener("progress", () => e.state.loading && watch(e));
      video.addEventListener("error", () => e.state.attached && fail(e));
      entries.push(e);
      byEl.set(el, e);
      nearIO.observe(el);
      seenIO.observe(el);
    },
    update,
  };
}
