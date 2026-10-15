// Case tile: poster, loop video, number pill, plate and the round close-up badge.
// The part shows what it is given. When the poster loads, when the video gets a source and when
// it plays is the owner's call; the part only shows the video once it has a frame and draws the
// badge from it while playing.
import { h } from "./parts.ts";
import "./tile.css";

export interface TileText {
  label: string; // what a screen reader says
  number: string; // "№ 03"
  kicker: string; // what the studio did, or "watch the case"
  title: string; // client
  result: string | null;
}

export interface TileArt {
  poster: string;
  posterPhone: string; // used at <= 700 px
  ring: [number, number]; // close-up point (0..1) for the badge
  eager?: boolean; // first tiles: load the poster at once, the rest wait for loadPoster()
}

export interface CaseTile {
  el: HTMLButtonElement;
  video: HTMLVideoElement;
  set(text: TileText): void;
  loadPoster(): void;
  // Draw video frames into the badge while true; the last frame stays when it stops.
  drawing(on: boolean): void;
}

export function caseTile(text: TileText, art: TileArt): CaseTile {
  const poster = h("img", {
    class: "tile-poster",
    alt: "",
    draggable: "false",
    decoding: "async",
    fetchpriority: art.eager ? "high" : null,
  });
  const source = h("source", { media: "(max-width: 700px)" });
  const picture = h("picture", {}, source, poster);
  const video = h("video", {
    class: "tile-video",
    muted: true,
    playsinline: true,
    loop: true,
    preload: "none",
    disablepictureinpicture: true,
    draggable: "false",
    "aria-hidden": "true",
    tabindex: "-1",
  });
  video.muted = true; // the attribute alone does not mute in every browser
  const ring = h("canvas", { class: "tile-ring", "aria-hidden": "true" });
  const number = h("span", { class: "tile-no" });
  const kicker = h("span", { class: "plate-k" });
  const title = h("span", { class: "plate-t" });
  const stat = h("span", { class: "plate-stat" });
  const plate = h("span", { class: "plate" }, kicker, title, stat);
  const el = h("button", { type: "button", class: "tile" }, picture, video, ring, number, plate);

  const ctx = ring.getContext("2d");
  let drawingOn = false;
  let frameHandle = 0;
  let videoFrames = false; // the handle came from requestVideoFrameCallback, not requestAnimationFrame

  // Close-up: a square around the ring point, a little under half of the short side.
  const draw = (source: HTMLVideoElement | HTMLImageElement) => {
    const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    if (!ctx || !sw || !sh || !ring.width) return;
    const side = Math.min(sw, sh) * 0.45;
    const x = Math.min(Math.max(art.ring[0] * sw - side / 2, 0), sw - side);
    const y = Math.min(Math.max(art.ring[1] * sh - side / 2, 0), sh - side);
    try {
      ctx.drawImage(source, x, y, side, side, 0, 0, ring.width, ring.height);
    } catch {
      // A source that cannot be drawn leaves the badge as it was.
    }
  };
  const drawStill = () => draw(video.readyState >= 2 && el.classList.contains("shown") ? video : poster);

  const loop = () => {
    if (!drawingOn) return;
    draw(video);
    videoFrames = "requestVideoFrameCallback" in video;
    frameHandle = videoFrames ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
  };
  // Each handle goes back to the API that gave it: the id spaces overlap, and a wrong cancel
  // would stop some other animation loop.
  const stopLoop = () => (videoFrames ? video.cancelVideoFrameCallback(frameHandle) : cancelAnimationFrame(frameHandle));

  poster.addEventListener("load", () => {
    el.classList.remove("no-poster");
    if (!el.classList.contains("shown")) draw(poster);
  });
  // A missing poster leaves the dark tile with its plate: the placeholder state.
  poster.addEventListener("error", () => el.classList.add("no-poster"));
  video.addEventListener("playing", () => el.classList.add("shown"));
  video.addEventListener("emptied", () => {
    el.classList.remove("shown");
    drawStill();
  });

  new ResizeObserver(() => {
    const css = ring.clientWidth;
    const size = Math.round(css * Math.min(devicePixelRatio || 1, 2));
    if (!size || size === ring.width) return;
    ring.width = ring.height = size;
    drawStill();
  }).observe(ring);

  const api: CaseTile = {
    el,
    video,
    loadPoster() {
      if (poster.hasAttribute("src")) return;
      source.srcset = art.posterPhone;
      poster.src = art.poster;
    },
    set(t) {
      el.setAttribute("aria-label", t.label);
      number.textContent = t.number;
      kicker.textContent = t.kicker;
      title.textContent = t.title;
      stat.textContent = t.result ?? "";
      stat.hidden = !t.result;
    },
    drawing(on) {
      if (on === drawingOn) return;
      drawingOn = on;
      stopLoop();
      if (on) loop();
    },
  };
  api.set(text);
  if (art.eager) api.loadPoster();
  return api;
}
