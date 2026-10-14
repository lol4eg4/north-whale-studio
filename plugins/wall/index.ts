// The wall: eight live case tiles packed with stickers, the ticker and the team block.
//
//   init:  section, heading, slot places (dive cell, hint)        -> slots resolve
//   ready: every other cell in W order around the dive cell        -> motion group "wall"
//   loops: videos.ts decides which tiles load and play
import type { Host } from "../../platform/host.ts";
import { binder } from "../../platform/text-binder.ts";
import { h, icon, isTouch, note } from "../../platform/ui/parts.ts";
import { caseTile } from "../../platform/ui/tile.ts";
import { ticker } from "../../platform/ui/ticker.ts";
import type { CaseApi } from "../case/api.ts";
import type { CaseItem, ContentApi } from "../content/api.ts";
import type { ServiceApi } from "../service/api.ts";
import { isSticker, SERVICE_COLORS, starPoints, tilts, W, type Slot } from "./layout.ts";
import { createRollCall } from "./rollcall.ts";
import { createVideos } from "./videos.ts";
import "./style.css";

const two = (n: number) => String(n).padStart(2, "0");
const DARK = ["cobalt", "ink", "signal"];

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

  // Loops pause while a case is open, motion is paused or calm, or the tab is hidden.
  let caseOpen = false;
  const videos = createVideos({
    phone: matchMedia("(max-width: 700px)"),
    blocked: () => caseOpen || motion.paused || motion.calm || document.hidden,
  });
  host.on("case-opened", () => ((caseOpen = true), videos.update()));
  host.on("case-closed", () => ((caseOpen = false), videos.update()));
  // Posters load within one screen of the viewport, like the loops; the first tile's at once.
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

  const refresh: (() => void)[] = [];

  host.ready(() => {
    const api = content();
    const team = api.team();
    const clients = api.clients();
    const tilt = tilts(W.filter(isSticker).length);
    let ti = 0;
    const tagCells: HTMLElement[] = [];
    let teamCell: HTMLElement | null = null;
    let roll: () => void = () => {};

    t.bind(title, "wall.title");
    t.bind(wallNote.querySelector(".note-text")!, "wall.note");
    wallNote.setAttribute("aria-hidden", "true");

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
    });

    const build = (slot: Slot, r: number): HTMLElement => {
      switch (slot.k) {
        case "tile": {
          const c = api.caseById(slot.id)!;
          const tile = caseTile(tileText(c), { poster: c.media.poster, posterPhone: c.media.posterPhone, ring: c.ring, eager: c.id === 1 });
          t.bind(tile.el, "cursor.open", "data-cursor");
          tile.el.addEventListener("click", () => host.use<CaseApi>("case").open(c.id, "tile", tile.el));
          tile.el.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && host.emit("tile-hovered", { id: c.id }));
          videos.add(c.id, tile.el, tile.video, { wide: c.media.tile, phone: c.media.phone }, tile.drawing);
          posterLoads.set(tile.el, tile.loadPoster);
          posters.observe(tile.el);
          host.use<CaseApi>("case").setTile?.(c.id, tile.el);
          refresh.push(() => tile.set(tileText(content().caseById(c.id)!)));
          return cell(`sz-${c.size}`, tile.el, "tile", c.id);
        }
        case "tag": {
          const m = team[slot.i];
          const name = h("span");
          const role = h("span", { class: "tag-role" });
          const el = stickerEl("div", "tag", r, { "aria-hidden": "true" });
          el.append(
            h(
              "span",
              { class: "tag-band", style: `--c:var(--${m.color});--bf:var(--${DARK.includes(m.color) ? "paper" : "ink"})` },
              t.bind(h("b"), "tag.hello"),
              t.bind(h("i"), "tag.name"),
            ),
            h("span", { class: "tag-nm" }, h("span", { class: "tag-ph" }), name),
            role,
          );
          const set = () => {
            const now = content().team()[slot.i];
            name.textContent = now.name;
            role.textContent = now.role;
          };
          set();
          refresh.push(set);
          t.bind(el, "cursor.drag", "data-cursor");
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
          const c = cell(main ? "sz-s2" : "sz-s", el, "sticker");
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
          return cell("sz-s t6", el, "sticker");
        }
        case "telegram": {
          const tg = api.contacts().messengers.find((m) => m.name === "Telegram")?.url;
          const to: Record<string, string> = tg ? { href: tg, target: "_blank", rel: "noopener" } : { href: "#contacts" };
          const el = stickerEl("a", "client sh-pill", r, { ...to, style: "--c:var(--cobalt);--f:var(--paper)" });
          el.append(t.bind(h("b"), "sticker.telegram"), t.bind(h("span", { class: "ck" }), "sticker.telegramSub"));
          t.bind(el, "cursor.write", "data-cursor");
          return cell("sz-s t6", el, "sticker");
        }
        case "deeper": {
          const el = stickerEl("a", "client sh-circle deeper", r, { href: "#finale", style: "--c:var(--lemon);--f:var(--ink)" });
          el.append(t.bind(h("b"), "sticker.deeper"));
          t.bind(el, "cursor.dive", "data-cursor");
          return cell("sz-s t6", el, "sticker");
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
    roll = createRollCall(motion, wall, teamCell!, tagCells);

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
    const start = () =>
      setTimeout(() => {
        started = true;
        section.classList.add("awake");
        runTicker();
      }, 2000);
    if (document.readyState === "complete") start();
    else addEventListener("load", start, { once: true });
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
