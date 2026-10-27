// The wall: eight live case tiles packed with stickers, the ticker and the team block.
//
//   init:  section, heading, slot places (dive cell, hint)        -> slots resolve
//   ready: every other cell in W order around the dive cell        -> motion group "wall"
//   loops: videos.ts decides which tiles load and play
import type { Host } from "../../platform/host.ts";
import { binder } from "../../platform/text-binder.ts";
import { h, icon, isTouch, note, writeIn } from "../../platform/ui/parts.ts";
import { caseTile, logoMark } from "../../platform/ui/tile.ts";
import { ticker } from "../../platform/ui/ticker.ts";
import type { CaseApi } from "../case/api.ts";
import type { CaseItem, ContentApi } from "../content/api.ts";
import type { ServiceApi } from "../service/api.ts";
import { isSticker, SERVICE_COLORS, starPoints, tilts, W, type Slot } from "./layout.ts";
import { createMeet } from "./meet.ts";
import { createRollCall } from "./rollcall.ts";
import { createVideos } from "./videos.ts";
import "./style.css";

const two = (n: number) => String(n).padStart(2, "0");
const DARK = ["cobalt", "ink", "signal"];
const TAG_VIDEO = 100; // badge loops take ids from here, so they never meet a case id in videos.ts

export default function init(host: Host) {
  const { motion } = host;
  const content = () => host.use<ContentApi>("content");
  const t = binder((key) => content().text(key));

  const title = h("h2", { class: "mono work-title", id: "wall-title" });
  const wallNote = note("", "none");
  const hint = h("div", { class: "work-hint" });
  const head = h("div", { class: "work-head" }, title, wallNote, hint);
  const wall = h("div", { class: "wall" });
  const section = h("section", { class: "work", id: "cases", "aria-labelledby": "wall-title" }, head, wall);
  host.region("main").append(section);

  const diveCell = h("div", { class: "cell sz-l dive-cell" });
  wall.append(diveCell);

  host.slot("wall-hint", hint, (place) => {
    place.append(t.bind(h("p", { class: "mono" }), isTouch() ? "wall.hintCoarse" : "wall.hintFine"));
  });
  host.slot("wall-dive", diveCell, (place) => {
    const block = h(
      "div",
      { class: "whale-block", "aria-hidden": "true" },
      h("span", { class: "whale-disc" }, h("img", { src: "/whale.svg", alt: "", draggable: "false" })),
    );
    place.append(block);
    motion.add(block, { kind: "block", raise: place });
    t.bind(block, "cursor.drag", "data-cursor");
  });

  // Loops pause while a case is open, the pause button is on, or the tab is hidden. The case
  // badges play in calm too, as the owner asked; Maria's badge loop stays still in calm.
  let caseOpen = false;
  const videos = createVideos({
    phone: matchMedia("(max-width: 700px)"),
    blocked: () => caseOpen || motion.stopped || document.hidden,
  });
  host.on("case-opened", () => ((caseOpen = true), videos.update()));
  host.on("case-closed", () => ((caseOpen = false), videos.update()));
  // Posters and badge photos load within one screen of the viewport, like the loops; the first tile's at once.
  const posterLoads = new Map<Element, () => void>();
  const posters = new IntersectionObserver(
    (list) => {
      for (const r of list) {
        if (!r.isIntersecting) continue;
        posterLoads.get(r.target)?.();
        posters.unobserve(r.target);
      }
    },
    { rootMargin: "100% 0px" },
  );

  // 2 s after load: the ticker starts, and badge photos (small, below the first poster) may load
  // near the screen, so the first screen's bytes go to the case posters.
  const later = new Promise<void>((go) => {
    const arm = () => setTimeout(go, 2000);
    if (document.readyState === "complete") arm();
    else addEventListener("load", arm, { once: true });
  });

  const refresh: (() => void)[] = [];
  const meet = createMeet(motion, () => content().text("tag.close"), () => content().text("cursor.close"));

  host.ready(() => {
    const api = content();
    const team = api.team();
    const clients = api.clients();
    const tilt = tilts(W.filter(isSticker).length);
    let ti = 0;
    const tagCells: HTMLElement[] = [];
    const photosNow: (() => void)[] = [];
    let teamCell: HTMLElement | null = null;
    let roll: () => void = () => {};

    t.bind(title, "wall.title");
    t.bind(wallNote.querySelector(".note-text")!, "wall.note");
    wallNote.setAttribute("aria-hidden", "true");
    writeIn(wallNote);

    const cell = (cls: string, piece: HTMLElement, kind: "tile" | "sticker" | "block", tag?: number) => {
      const c = h("div", { class: `cell ${cls}` }, piece);
      motion.add(piece, { kind, tag, raise: c });
      return c;
    };
    const stickerEl = <K extends "a" | "button" | "div">(tag: K, cls: string, r: number, attrs: Record<string, string> = {}) =>
      h(tag, { ...attrs, class: `sticker ${cls}`, style: `--r:${r.toFixed(1)}deg;${attrs.style ?? ""}` });

    const tileText = (c: CaseItem) => ({
      label: c.sr,
      number: api.format("wall.number", { n: two(c.id) }),
      kicker: c.what ?? api.text("wall.watch"),
      title: c.client,
      result: c.result,
      seen: c.press.length ? { label: api.text("case.seenIn"), marks: c.press } : null,
    });

    const build = (slot: Slot, r: number): HTMLElement => {
      switch (slot.k) {
        case "tile": {
          const c = api.caseById(slot.id)!;
          const tile = caseTile(tileText(c), { poster: c.media.poster, posterPhone: c.media.posterPhone, ringPoster: c.media.ringPoster, eager: c.id === 1 });
          t.bind(tile.el, "cursor.open", "data-cursor");
          tile.el.addEventListener("click", () => host.use<CaseApi>("case").open(c.id, "tile", tile.el));
          tile.el.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && host.emit("tile-hovered", { id: c.id }));
          if (c.media.ring) videos.add(c.id, tile.el, tile.video, c.media.ring);
          // The badge's still waits like the badge photos: the first screen's bytes go to the posters.
          posterLoads.set(tile.el, () => (tile.loadPoster(), void later.then(tile.loadRing)));
          posters.observe(tile.el);
          host.use<CaseApi>("case").setTile?.(c.id, tile.el);
          refresh.push(() => tile.set(tileText(content().caseById(c.id)!)));
          return cell(`sz-${c.size}${slot.narrow ? " t3" : ""}`, tile.el, "tile", c.id);
        }
        case "tag": {
          const m = team[slot.i];
          const name = h("span");
          const role = h("span", { class: "tag-role" });
          const el = stickerEl("button", "tag", r, { type: "button" });
          // The photo sits in the round spot; a member with a video gets it on top, played by videos.ts.
          const photo = h("img", { alt: "", draggable: "false", decoding: "async" });
          const spot = h("span", { class: "tag-ph" }, photo);
          photo.addEventListener("error", () => spot.classList.add("no-photo"));
          const show = () => photo.setAttribute("src", m.photo);
          posterLoads.set(el, () => void later.then(show));
          posters.observe(el);
          photosNow.push(show);
          if (m.video) {
            const video = h("video", {
              muted: true,
              loop: true,
              playsinline: true,
              preload: "none",
              disablepictureinpicture: true,
              draggable: "false",
              "aria-hidden": "true",
              tabindex: "-1",
            });
            video.muted = true; // the attribute alone does not mute in every browser
            video.addEventListener("playing", () => spot.classList.add("shown"));
            video.addEventListener("emptied", () => spot.classList.remove("shown"));
            spot.append(video);
            videos.add(TAG_VIDEO + m.id, el, video, m.video, () => motion.calm);
          }
          el.append(
            h(
              "span",
              { class: "tag-band", style: `--c:var(--${m.color});--bf:var(--${DARK.includes(m.color) ? "paper" : "ink"})` },
              t.bind(h("b"), "tag.hello"),
              t.bind(h("i"), "tag.name"),
            ),
            h("span", { class: "tag-nm" }, spot, name),
            role,
          );
          const label = () => {
            const now = content().team()[slot.i];
            return `${now.name}, ${now.role}`;
          };
          const set = () => {
            const now = content().team()[slot.i];
            name.textContent = now.name;
            role.textContent = now.role;
            el.setAttribute("aria-label", content().format("tag.open", { name: label() }));
          };
          set();
          refresh.push(set);
          t.bind(el, "cursor.meet", "data-cursor");
          el.addEventListener("click", () => meet.open(el, label(), m.photo, m.video));
          const c = cell("sz-s tag-cell", el, "sticker");
          tagCells.push(c);
          return c;
        }
        case "client": {
          const cl = clients[slot.i];
          const name = h("b");
          const el = stickerEl("button", `client sh-${cl.shape}`, r, { type: "button", style: `--c:var(--${cl.bg});--f:var(--${cl.fg})` });
          el.append(name, t.bind(h("span", { class: "ck" }), "client.label"));
          const set = () => (name.textContent = content().clients()[slot.i].name);
          set();
          refresh.push(set);
          t.bind(el, "cursor.open", "data-cursor");
          el.addEventListener("click", () => host.use<CaseApi>("case").open(cl.caseId, "tile", el));
          return cell(`sz-s${cl.phone ? "" : " d-only"}`, el, "sticker", cl.caseId);
        }
        case "svc":
        case "svc2": {
          const id = slot.id;
          const main = slot.k === "svc2";
          const [bg, fg] = SERVICE_COLORS[id] ?? ["ink", "paper"];
          const name = h("b");
          const phrase = h("span", { class: "svc2-p" });
          const el = stickerEl("button", main ? "svc2" : "svc", r, { type: "button", style: main ? "" : `--c:var(--${bg});--f:var(--${fg})` });
          el.append(t.bind(h("span", { class: "mono" }), main ? "service.main" : "service.label"), name);
          if (main) el.append(phrase);
          const set = () => {
            const s = content().services().find((x) => x.id === id)!;
            name.textContent = s.title;
            phrase.textContent = s.phrase;
          };
          set();
          refresh.push(set);
          t.bind(el, "cursor.open", "data-cursor");
          el.addEventListener("click", () => host.use<ServiceApi>("service").open(id, el));
          const c = cell(main ? "sz-s2" : slot.wide ? "sz-s sw" : "sz-s", el, "sticker");
          if (main) c.id = "services";
          return c;
        }
        case "star": {
          const tpl = document.createElement("template");
          tpl.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="${starPoints()}"/></svg>`;
          const el = h(
            "a",
            { href: "#contacts", class: "hello", style: `--r:${r.toFixed(1)}deg` },
            h("span", { class: "hello-spin" }, tpl.content),
            t.bind(h("span", { class: "hello-t" }), "sticker.hello"),
          );
          t.bind(el, "cursor.write", "data-cursor");
          return cell("sz-s star-cell", el, "sticker");
        }
        case "whale": {
          const el = stickerEl("div", "whale-st", r, { "aria-hidden": "true" });
          el.append(h("img", { src: "/whale.svg", alt: "", draggable: "false" }));
          t.bind(el, "cursor.drag", "data-cursor");
          return cell("sz-s p2", el, "sticker");
        }
        case "telegram": {
          const tg = api.contacts().messengers.find((m) => m.name === "Telegram")?.url;
          const to: Record<string, string> = tg ? { href: tg, target: "_blank", rel: "noopener" } : { href: "#contacts" };
          const el = stickerEl("a", "client sh-pill", r, { ...to, style: "--c:var(--cobalt);--f:var(--paper)" });
          el.append(t.bind(h("b"), "sticker.telegram"), t.bind(h("span", { class: "ck" }), "sticker.telegramSub"));
          t.bind(el, "cursor.write", "data-cursor");
          return cell("sz-s", el, "sticker");
        }
        case "deeper": {
          const el = stickerEl("a", "client sh-circle deeper", r, { href: "#finale", style: "--c:var(--lemon);--f:var(--ink)" });
          el.append(t.bind(h("b"), "sticker.deeper"));
          t.bind(el, "cursor.dive", "data-cursor");
          return cell("sz-s", el, "sticker");
        }
        case "sheet": {
          // The logos load near the screen and after the first 2 s, like the badge photos.
          const el = h("div", { class: "brand-sheet" }, t.bind(h("h3", { class: "mono" }), "wall.brands"), h("p", { class: "brand-sheet-logos" }, ...api.brands().map((b) => logoMark(b))));
          t.bind(el, "cursor.drag", "data-cursor");
          posterLoads.set(el, () => void later.then(() => el.classList.add("on")));
          posters.observe(el);
          return cell("sz-sheet", el, "block");
        }
        case "tick": {
          const words = () => content().text("ticker.words").split("|");
          const tk = ticker(api.text("ticker.label"), words());
          refresh.push(() => tk.set(content().text("ticker.label"), words()));
          t.bind(tk.el, "cursor.drag", "data-cursor");
          tickerEl = tk.el;
          return cell("sz-tick", tk.el, "block");
        }
        case "team": {
          const el = h(
            "button",
            { type: "button", class: "team-block on-cobalt" },
            t.bind(h("span", { class: "mono" }), "team.kicker"),
            h("span", { class: "team-big" }, t.bind(h("b"), "team.hello"), t.bind(h("span"), "team.body")),
            h("span", { class: "mono team-more arrowed" }, t.bind(h("span"), "team.more"), icon("arrowRight", 14)),
          );
          t.bind(el, "cursor.meet", "data-cursor");
          el.addEventListener("click", () => roll());
          teamCell = cell("sz-fam", el, "block");
          teamCell.id = "team";
          return teamCell;
        }
        case "dive":
          return diveCell;
      }
    };

    let tickerEl: HTMLElement | null = null;
    const cells = W.map((slot) => build(slot, isSticker(slot) ? tilt[ti++] : 0));
    wall.append(...cells);
    motion.group("wall", wall);
    const rollCall = createRollCall(motion, wall, teamCell!, tagCells);
    // The roll call brings every badge on screen: their photos do not wait for the 2 s.
    roll = () => {
      for (const show of photosNow) show();
      void rollCall();
    };

    // Links to #team anywhere on the page call the roll instead of jumping.
    document.addEventListener("click", (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href="#team"]');
      if (!a || e.defaultPrevented) return;
      e.preventDefault();
      if (!motion.held) roll();
    });

    // Ticker and star start 2 s after load so the hero sticker is noticed first; asleep off screen.
    const sleepers = [tickerEl!, section.querySelector<HTMLElement>(".star-cell")!];
    const awake = new Set<Element>();
    let started = false;
    const runTicker = () => tickerEl!.classList.toggle("run", started && awake.has(tickerEl!) && !motion.paused && !motion.calm);
    new IntersectionObserver(
      (list) => {
        for (const r of list) {
          r.target.classList.toggle("asleep", !r.isIntersecting);
          if (r.isIntersecting) awake.add(r.target);
          else awake.delete(r.target);
        }
        runTicker();
      },
      { rootMargin: "100px" },
    ).observe(tickerEl!);
    for (const el of sleepers.slice(1)) new IntersectionObserver((list) => list.forEach((r) => r.target.classList.toggle("asleep", !r.isIntersecting)), { rootMargin: "100px" }).observe(el);
    void later.then(() => {
      started = true;
      section.classList.add("awake");
      runTicker();
    });
    motion.onChange(() => {
      runTicker();
      videos.update();
    });
  });

  host.on("language-changed", () => {
    t.refresh();
    for (const fn of refresh) fn();
  });
}
