// Case tile: a still poster, the number pill, the plate and the round badge, the tile's only
// moving part. The part shows what it is given: when the posters load, when the badge's loop gets
// a source and when it plays is the owner's call.
import { h } from "./parts.ts";
import "./tile.css";

export interface TileText {
  label: string; // what a screen reader says
  number: string; // "№ 03"
  kicker: string; // what the studio did, or "watch the case"
  title: string; // client
  result: string | null;
  seen: { label: string; marks: { name: string; logo: string; ratio: number }[] } | null; // "As seen in" and logos
}

export interface TileArt {
  poster: string;
  posterPhone: string; // used at <= 700 px
  ringPoster: string; // the badge's still until its loop plays, loaded by loadRing() with the press logos
  eager?: boolean; // first tiles: load the poster at once, the rest wait for loadPoster()
}

export interface CaseTile {
  el: HTMLButtonElement;
  video: HTMLVideoElement; // the round badge's loop
  set(text: TileText): void;
  loadPoster(): void;
  loadRing(): void;
}

// A publication's logo in one colour (currentColor), the way the reference draws them.
export function logoMark(m: { name: string; logo: string; ratio: number }): HTMLSpanElement {
  const el = h("span", { class: "logo-mark", role: "img", "aria-label": m.name });
  el.style.setProperty("--logo", `url("${m.logo}")`);
  el.style.setProperty("--ar", String(m.ratio));
  return el;
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
  const ring = h("span", { class: "tile-ring", "aria-hidden": "true" }, video);
  const number = h("span", { class: "tile-no" });
  const kicker = h("span", { class: "plate-k" });
  const title = h("span", { class: "plate-t" });
  const stat = h("span", { class: "plate-stat" });
  const more = h("span", { class: "plate-more" }, stat);
  const seen = h("span", { class: "plate-seen" });
  const plate = h("span", { class: "plate" }, kicker, title, more, seen);
  // The paper's corner: a small tab that curls up when the tile is hovered.
  const peel = h("span", { class: "tile-peel", "aria-hidden": "true" });
  const el = h("button", { type: "button", class: "tile" }, picture, ring, number, plate, peel);

  // A missing poster leaves the dark tile with its plate: the placeholder state.
  poster.addEventListener("load", () => el.classList.remove("no-poster"));
  poster.addEventListener("error", () => el.classList.add("no-poster"));

  const api: CaseTile = {
    el,
    video,
    loadPoster() {
      if (poster.hasAttribute("src")) return;
      source.srcset = art.posterPhone;
      poster.src = art.poster;
    },
    loadRing() {
      video.poster = art.ringPoster;
      seen.classList.add("on"); // the logos load with the badge, after the first screen's posters
    },
    set(t) {
      el.setAttribute("aria-label", t.label);
      number.textContent = t.number;
      kicker.textContent = t.kicker;
      title.textContent = t.title;
      stat.textContent = t.result ?? "";
      more.hidden = !t.result;
      seen.replaceChildren(...(t.seen ? [h("i", { class: "mono" }, t.seen.label), ...t.seen.marks.map((m) => logoMark(m))] : []));
      seen.hidden = !t.seen;
    },
  };
  api.set(text);
  if (art.eager) api.loadPoster();
  return api;
}
