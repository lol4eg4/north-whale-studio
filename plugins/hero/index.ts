// First screen: kicker, the big headline with its last word on the orange peel sticker,
// the marker note pointing at it, the lede and the two ways down the page.
// Every word is a piece; under the sticker the same word stays printed as an outline.
import type { Host } from "../../platform/host.ts";
import { binder } from "../../platform/text-binder.ts";
import { h, icon, isTouch } from "../../platform/ui/parts.ts";
import type { ContentApi } from "../content/api.ts";
import "./style.css";


// Where the marker note goes (the mock's placeNote):
//   room >= 260 px right of the sticker: beside it, arrow to the left
//   96..260 px: beside it, narrow, smaller type
//   < 96 px: under the sticker's right end, arrow up
function notePlace(hero: DOMRect, peel: DOMRect, padRight: number, noteWidth = 0) {
  const room = hero.right - peel.right - padRight;
  const mode = room < 96 ? "under" : room < 260 ? "narrow" : "beside";
  const maxWidth = mode === "narrow" ? room - 10 : 0;
  if (mode === "under") return { mode, maxWidth, left: Math.max(8, peel.right - hero.left - noteWidth + 10), top: peel.bottom - hero.top + 8 };
  if (mode === "narrow") return { mode, maxWidth, left: peel.right - hero.left + 8, top: peel.top - hero.top - 14 };
  return { mode, maxWidth, left: peel.right - hero.left + 14, top: peel.top - hero.top + 4 };
}

export default function init(host: Host) {
  const { motion } = host;
  const content = () => host.use<ContentApi>("content");
  const t = binder((key) => content().text(key));

  const k1 = h("span");
  const k2 = h("span");
  const title = h("h1", { class: "hero-title", id: "hero-title" });
  const noteText = h("span", { class: "note-text" });
  const left = icon("arrowLeft", 90);
  const up = icon("arrowUp", 70);
  left.classList.add("left");
  up.classList.add("up");
  const heroNote = h("span", { class: "note hero-note", "aria-hidden": "true" }, noteText, left, up);
  const lede = h("p", { class: "lede" });
  const watchText = h("span");
  const watch = h("a", { class: "pill watch", href: "#cases", style: "--r:-1.5deg" }, h("span", { class: "badge", "aria-hidden": "true" }), watchText);
  const howText = h("span");
  const how = h("a", { class: "link-under believe arrowed", href: "#manifesto" }, howText, icon("arrowRight", 18));
  const section = h(
    "section",
    { class: "hero", "aria-labelledby": "hero-title" },
    h("div", { class: "kicker mono" }, k1, k2),
    title,
    heroNote,
    h("div", { class: "hero-row" }, lede, h("div", { class: "hero-side" }, watch, how)),
  );
  host.region("main").append(section);

  let slot: HTMLElement | null = null;
  let titlePieces: number[] = [];

  // Headline words are pieces; their structure follows the language, so it is rebuilt.
  const buildTitle = () => {
    for (const id of titlePieces) motion.remove(id);
    const api = content();
    const drag = api.text("cursor.drag");
    const words = api.text("hero.title").split(/\s+/).filter(Boolean);
    const peelWord = api.text("hero.peel");
    const spans = words.map((w) => h("span", { class: "hw", "data-cursor": drag }, w));
    const peel = h("span", { class: "peel", style: "--r:-3deg", "data-cursor": api.text("cursor.pull") }, peelWord);
    slot = h("span", { class: "peel-slot" }, h("span", { class: "peel-ghost", "aria-hidden": "true" }, peelWord), peel);
    title.replaceChildren(...spans.flatMap((s) => [s, " "]), slot);
    titlePieces = [...spans.map((s) => motion.add(s, { kind: "word" })), motion.add(peel, { kind: "sticker" })];
  };

  // The note sits beside the sticker, narrower when room is short, or under it (mock placeNote).
  const placeNote = () => {
    if (!slot) return;
    const hr = section.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(section).paddingRight);
    const fit = notePlace(hr, slot.getBoundingClientRect(), pad);
    heroNote.classList.toggle("under", fit.mode === "under");
    heroNote.classList.toggle("narrow", fit.mode === "narrow");
    section.classList.toggle("note-under", fit.mode === "under");
    heroNote.style.maxWidth = fit.maxWidth ? `${fit.maxWidth}px` : "";
    const q = slot.getBoundingClientRect();
    const at = notePlace(hr, q, pad, heroNote.offsetWidth);
    heroNote.style.left = `${at.left}px`;
    heroNote.style.top = `${at.top}px`;
    // The note never sits on the lede: move the lede down by what overlaps.
    title.style.marginBottom = "";
    const n = heroNote.getBoundingClientRect();
    const l = lede.getBoundingClientRect();
    const over = n.bottom + 8 - l.top;
    if (over > 0 && n.left < l.right && n.right > l.left) {
      // The headline's bottom margin collapses with the row's top margin: grow the larger one.
      const gap = Math.max(parseFloat(getComputedStyle(title).marginBottom), parseFloat(getComputedStyle(lede.parentElement!).marginTop));
      title.style.marginBottom = `${gap + over}px`;
    }
  };

  host.ready(() => {
    t.bind(k1, "hero.kicker1");
    t.bind(k2, "hero.kicker2");
    t.bind(lede, "hero.lede");
    t.bind(watchText, "hero.watch");
    t.bind(howText, "hero.how");
    t.bind(noteText, isTouch() ? "hero.noteCoarse" : "hero.noteFine");
    for (const el of [k1, k2, lede]) {
      motion.add(el, { kind: "word" });
      t.bind(el, "cursor.drag", "data-cursor");
    }
    motion.add(watch, { kind: "word" });
    motion.add(how, { kind: "word" });
    t.bind(watch, "cursor.open", "data-cursor");
    buildTitle();
    placeNote();
    document.fonts?.ready.then(placeNote);
    let queued = 0; // one placement per frame, however many resize events come
    addEventListener("resize", () => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(placeNote);
    });
  });

  host.on("language-changed", () => {
    t.refresh();
    buildTitle();
    placeNote();
  });
}
