// Open case: a native modal dialog over the wall, kept in step with the address (history.ts).
//
//   [ media frame + player ][ North Whale Studio · Кейс 03 из 08     [× Назад к стене Esc] ]
//   [                      ][ Client / what · result / story placeholders                 ]
//   [                      ][ [Обсудить похожий проект] [Следующий кейс →] Скопировать ссылку ]
import type { CaseFrom } from "../../platform/events.ts";
import type { Host } from "../../platform/host.ts";
import { binder } from "../../platform/text-binder.ts";
import { button, h, icon, overlay, placeholderBox, toast } from "../../platform/ui/parts.ts";
import type { CaseItem, ContentApi } from "../content/api.ts";
import type { CaseApi } from "./api.ts";
import { onLoad, onNavigate, onNext, onOpen, onRequestClose, type Act } from "./history.ts";
import { createPlayer } from "./player.ts";
import "./style.css";

const two = (n: number) => String(n).padStart(2, "0");
const address = (hash: string) => location.pathname + location.search + hash;
// Same as following a link to that anchor, without reading anyone's markup.
const goTo = (hash: string) => h("a", { href: hash }).click();

export default function init(host: Host) {
  const { motion } = host;
  const content = () => host.use<ContentApi>("content");
  const text = (key: string) => content().text(key);
  const t = binder(text);
  const ids = () => content().cases().map((c) => c.id);

  const dlg = overlay("case", () => requestClose());
  dlg.el.setAttribute("aria-labelledby", "case-title");
  const player = createPlayer(text, motion);

  const counter = h("span", { class: "case-count" });
  const closeBtn = h("button", { type: "button", class: "btn case-x" }, icon("close", 14), h("span", { class: "case-x-t" }), h("kbd", {}, "Esc"));
  const titleEl = h("h2", { class: "case-title", id: "case-title" });
  const sub = h("div", { class: "case-sub" });
  const story = h("div", { class: "case-story" });
  const talk = button("", "action", { class: "case-talk" });
  const next = button("", "ghost", { class: "case-next" });
  const copy = h("button", { type: "button", class: "link-copy" });
  const field = h("input", { class: "case-link", type: "text", readonly: true, hidden: true });
  const body = h(
    "div",
    { class: "case-body" },
    h("div", { class: "case-top" }, h("span", { class: "mono" }, h("b", { class: "cw" }, "North Whale Studio"), " · ", counter), closeBtn),
    titleEl,
    sub,
    story,
    h("div", { class: "case-actions" }, talk, next, copy, field),
  );
  const panel = h("div", { class: "case-in on-cobalt" }, player.el, body);
  dlg.el.append(panel);

  let openId: number | null = null;
  let firstId: number | null = null; // the case the dialog opened with
  let opener: HTMLElement | null = null;
  let closing = false;
  let closeTimer = 0;
  let after: (() => void) | null = null;
  const tiles = new Map<number, HTMLElement>();
  const ctx = () => ({ open: openId, closing, ids: ids() });

  const render = (c: CaseItem) => {
    const all = content().cases();
    counter.textContent = content().format("case.counter", { n: two(all.findIndex((x) => x.id === c.id) + 1), total: two(all.length) });
    titleEl.textContent = c.client;
    sub.replaceChildren(...[c.what && h("span", {}, c.what), c.result && h("span", { class: "case-result" }, c.result)].filter((x): x is HTMLSpanElement => !!x));
    sub.hidden = !c.what && !c.result;
    story.replaceChildren(placeholderBox(c.story.task), placeholderBox(c.story.did), placeholderBox(c.story.result));
    field.hidden = true;
  };

  const show = (id: number, from: CaseFrom) => {
    const c = content().caseById(id);
    if (!c) return;
    const first = openId === null;
    openId = id;
    render(c);
    player.show(c);
    if (first) {
      firstId = id;
      dlg.open(opener);
      body.scrollTop = 0;
      closeBtn.focus();
      reveal();
    } else {
      body.scrollTop = 0;
      if (!motion.calm) panel.animate([{ opacity: 0.4, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    host.emit("case-opened", { id, from });
  };

  // The panel grows out of the tile it came from (T§4.6), content fades up after it.
  const reveal = () => {
    if (motion.calm) return;
    const from = opener?.isConnected ? opener.getBoundingClientRect() : null;
    const p = panel.getBoundingClientRect();
    if (from && from.width) {
      const inset = [from.top - p.top, p.right - from.right, p.bottom - from.bottom, from.left - p.left].map((v) => `${Math.max(0, v)}px`).join(" ");
      panel.animate([{ clipPath: `inset(${inset} round 6px)` }, { clipPath: "inset(0 0 0 0 round 10px)" }], { duration: 760, easing: "cubic-bezier(.76,0,.24,1)" });
    }
    [...body.children].forEach((child, i) =>
      child.animate([{ transform: "translateY(26px)", opacity: 0.001 }, { transform: "none", opacity: 1 }], {
        duration: 620,
        delay: (from ? 380 : 80) + i * 55,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "backwards",
      }),
    );
  };

  const hide = () => {
    if (openId === null) return;
    const id = openId;
    openId = null;
    closing = false;
    clearTimeout(closeTimer);
    player.stop();
    dlg.close(false);
    // Focus goes back to what opened the case; after Next or a link, to the tile of the case shown.
    const target = id === firstId && opener?.isConnected ? opener : (tiles.get(id) ?? opener);
    if (target?.isConnected && !after) {
      if (target !== opener) target.scrollIntoView({ block: "center", behavior: motion.calm ? "instant" : "smooth" });
      target.focus({ preventScroll: true });
    }
    opener = null;
    host.emit("case-closed", { id });
    const then = after;
    after = null;
    then?.();
  };

  const run = (acts: Act[]) => {
    for (const a of acts) {
      if (a.t === "push") history.pushState({ nwsCase: a.id }, "", address(`#case-${a.id}`));
      else if (a.t === "replace") {
        const ours = a.id !== undefined && history.state?.nwsCase !== undefined;
        history.replaceState(ours ? { nwsCase: a.id } : null, "", address(a.hash));
      } else if (a.t === "back") {
        closing = true;
        history.back();
        // If the browser never answers with popstate, close anyway.
        closeTimer = window.setTimeout(() => closing && hide(), 1500);
      } else if (a.t === "show") show(a.id, a.from);
      else if (a.t === "hide") hide();
      else if (a.t === "wall") location.replace(address("#cases"));
    }
  };

  function requestClose(then?: () => void) {
    if (openId === null || closing) return;
    after = then ?? null;
    run(onRequestClose(ctx(), history.state));
  }

  // The browser may close the dialog itself (Esc without a recent click): keep history in step.
  dlg.el.addEventListener("close", () => {
    if (openId !== null && !closing) requestClose();
  });
  closeBtn.addEventListener("click", () => requestClose());
  talk.addEventListener("click", () => requestClose(() => goTo("#contacts")));
  next.addEventListener("click", () => run(onNext(ctx())));
  copy.addEventListener("click", async () => {
    if (openId === null) return;
    const link = location.origin + address(`#case-${openId}`);
    try {
      await navigator.clipboard.writeText(link);
      field.hidden = true;
      toast(text("case.linkCopied"));
    } catch {
      field.value = link;
      field.hidden = false;
      field.focus();
      field.select();
      toast(text("case.copyFail"));
    }
  });

  const navigate = () => run(onNavigate(location.hash, ctx()));
  addEventListener("popstate", navigate);
  addEventListener("hashchange", navigate);

  const api: CaseApi = {
    open(id, from, from_el) {
      if (openId === null) opener = from_el ?? (document.activeElement as HTMLElement | null);
      run(onOpen(id, from, ctx()));
    },
    close: () => requestClose(),
    setTile(id, tile) {
      tiles.set(id, tile);
    },
  };
  host.provide<CaseApi>("case", api);

  host.ready(() => {
    t.bind(closeBtn.querySelector(".case-x-t")!, "case.close");
    t.bind(closeBtn, "case.close", "aria-label");
    t.bind(closeBtn, "cursor.close", "data-cursor");
    t.bind(talk, "case.discuss");
    t.bind(next, "case.next");
    t.bind(copy, "case.copyLink");
    run(onLoad(location.hash, ctx()));
  });

  host.on("language-changed", () => {
    t.refresh();
    player.render();
    if (openId !== null) render(content().caseById(openId)!);
  });
}
