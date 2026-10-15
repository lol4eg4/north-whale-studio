// Open case: a native modal dialog over the wall, kept in step with the address (history.ts).
//
//   [ media frame + player ][ North Whale Studio · Кейс 03 из 08     [× Назад к стене Esc] ]
//   [                      ][ eyebrow / title / client · category / lead                  ]
//   [                      ][ how we did it, cards: one batch, our role, results; links    ]
//   [                      ][ [Дальше: <next case> →] [Написать нам] Скопировать ссылку    ]
// A case with no page in data/pages.*.json shows its client, what · result and story placeholders.
import type { CaseFrom } from "../../platform/events.ts";
import type { Host } from "../../platform/host.ts";
import { binder } from "../../platform/text-binder.ts";
import { button, goTo, h, icon, overlay, placeholderBox, toast } from "../../platform/ui/parts.ts";
import { logoMark } from "../../platform/ui/tile.ts";
import type { CaseItem, CasePage, ContentApi } from "../content/api.ts";
import type { CaseApi } from "./api.ts";
import { onLoad, onNavigate, onNext, onOpen, onRequestClose, type Act } from "./history.ts";
import { createPlayer } from "./player.ts";
import "./style.css";

const two = (n: number) => String(n).padStart(2, "0");
// Each case has its own colour, as each case page of the reference does; these take light text.
const dark = new Set(["ink", "cobalt", "signal", "royal"]);
// A rise with no figure ("↑"): the display font has no arrow, so it is the site's own, turned up.
const up = () => {
  const el = icon("arrowRight", 48);
  el.classList.add("case-up");
  el.setAttribute("role", "img");
  el.setAttribute("aria-hidden", "false");
  el.setAttribute("aria-label", "↑");
  return el;
};
// ==text== in the studio's copy is a marker highlight.
const marked = (s: string, cls?: string) => s.split("==").map((part, i) => (i % 2 ? h("mark", { class: cls }, part) : part));
// Absolute, so it never leaves the site whatever the path looks like ("//x" would be another host).
const address = (hash: string) => {
  const url = new URL(location.href);
  url.hash = hash;
  return url.href;
};

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
  const eyebrow = h("p", { class: "case-eyebrow mono" });
  const titleEl = h("h2", { class: "case-title", id: "case-title" });
  const sub = h("div", { class: "case-sub" });
  const story = h("div", { class: "case-story" });
  const mediaTag = h("span", { class: "case-media-tag mono" });
  player.el.append(mediaTag);
  const talk = button("", "ghost", { class: "case-talk" });
  const nextText = h("span");
  const next = button("", "action", { class: "case-next" });
  next.append(nextText, icon("arrowRight", 18));
  const copy = h("button", { type: "button", class: "link-copy" });
  const field = t.bind(h("input", { class: "case-link", type: "text", readonly: true, hidden: true }), "case.copyLink", "aria-label");
  const body = h(
    "div",
    { class: "case-body" },
    h("div", { class: "case-top" }, h("span", { class: "mono" }, h("b", { class: "cw" }, "North Whale Studio"), " · ", counter), closeBtn),
    eyebrow,
    titleEl,
    sub,
    story,
    h("div", { class: "case-actions" }, next, talk, copy, field),
  );
  const panel = h("div", { class: "case-in" }, player.el, body);
  dlg.el.append(panel);

  let openId: number | null = null;
  let firstId: number | null = null; // the case the dialog opened with
  let opener: HTMLElement | null = null;
  let closing = false;
  let closeTimer = 0;
  let after: (() => void) | null = null;
  const tiles = new Map<number, HTMLElement>();
  const ctx = () => ({ open: openId, closing, ids: ids() });

  const page = (c: CaseItem, p: CasePage) => [
    h("dl", { class: "case-meta" }, ...(
      [
        ["case.client", p.client],
        ["case.category", p.category],
      ] as const
    ).map(([key, value]) => h("div", {}, h("dt", { class: "mono" }, text(key)), h("dd", {}, value)))),
    h("p", { class: "case-lead" }, ...marked(p.lead)),
    h("section", { class: "case-how" }, h("h3", { class: "mono" }, p.how.title), h("p", { class: "case-kicker" }, p.how.kicker), ...p.how.text.map((s) => h("p", {}, ...marked(s)))),
    p.card &&
      h("section", { class: "case-card" }, h("h3", { class: "case-tag" }, p.card.label), h("p", { class: "case-card-h" }, p.card.headline), h("p", {}, ...marked(p.card.copy, "b")), h("p", { class: "case-hand" }, p.card.hand)),
    h(
      "section",
      { class: "case-card case-role" },
      h("h3", { class: "case-tag" }, text("case.role")),
      h("ul", { class: "case-pills" }, ...p.role.items.map((r) => h("li", {}, r))),
      h("p", {}, `${text("case.deliverables")} ${p.role.deliverables}`),
    ),
    p.results &&
      h(
        "section",
        { class: "case-card case-results" },
        h("h3", { class: "case-tag" }, text("case.results")),
        h("ul", {}, ...p.results.items.map((r) => h("li", {}, h("b", {}, r.value === "↑" ? up() : r.value), h("span", {}, r.label)))),
        p.results.note && h("p", {}, p.results.note),
      ),
    c.press.length > 0 &&
      h(
        "section",
        { class: "case-press" },
        h("h3", { class: "mono" }, text("case.press")),
        h("div", { class: "case-clips" }, ...c.press.map((m) => h("a", { class: "case-clip", href: m.url, target: "_blank", rel: "noopener" }, logoMark(m), h("span", { class: "case-clip-t" }, m.title), h("span", { class: "mono" }, `${text("case.read")} →`)))),
      ),
    p.links.length > 0 && h("p", { class: "case-out" }, ...p.links.map((l) => h("a", { href: l.url, target: "_blank", rel: "noopener" }, `${l.label} →`))),
  ].filter((x): x is HTMLElement => !!x);

  const render = (c: CaseItem) => {
    const all = content().cases();
    const i = all.findIndex((x) => x.id === c.id);
    counter.textContent = content().format("case.counter", { n: two(i + 1), total: two(all.length) });
    panel.dataset.bg = c.color;
    panel.style.setProperty("--case-bg", `var(--${c.color})`);
    panel.classList.toggle("on-ink", dark.has(c.color));
    eyebrow.textContent = c.page?.eyebrow ?? "";
    eyebrow.hidden = !c.page;
    titleEl.textContent = c.page?.title ?? c.client;
    // A case page has client and category of its own: under its title only the lemon result.
    const subs = [!c.page && c.what && h("span", {}, c.what), c.result && h("span", { class: "case-result" }, c.result)].filter((x): x is HTMLSpanElement => !!x);
    sub.replaceChildren(...subs);
    sub.hidden = !subs.length;
    story.classList.toggle("own", !!c.page);
    story.replaceChildren(...(c.page ? page(c, c.page) : [placeholderBox(c.story.task), placeholderBox(c.story.did), placeholderBox(c.story.result)]));
    mediaTag.textContent = c.page?.media ?? "";
    mediaTag.hidden = !c.page;
    // Next names the next case; the last one leads back to the wall.
    const n = all[i + 1];
    nextText.textContent = n ? content().format("case.nextTo", { title: n.page?.title ?? n.client }) : text("case.toWall");
    field.hidden = true;
  };
  const isLast = () => openId !== null && openId === ids().at(-1);

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
    // The top line holds the close cross, pinned to the screen on tablets and phones; a transform
    // on that line would carry the cross along, so the line only fades in.
    [...body.children].forEach((child, i) =>
      child.animate(child.contains(closeBtn) ? [{ opacity: 0.001 }, { opacity: 1 }] : [{ transform: "translateY(26px)", opacity: 0.001 }, { transform: "none", opacity: 1 }], {
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
  next.addEventListener("click", () => (isLast() ? requestClose() : run(onNext(ctx()))));
  copy.addEventListener("click", async () => {
    if (openId === null) return;
    const link = address(`#case-${openId}`);
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

  const navigate = () => {
    const acts = onNavigate(location.hash, ctx());
    // The step back we waited for has come, wherever it landed.
    closing = false;
    clearTimeout(closeTimer);
    run(acts);
  };
  addEventListener("popstate", navigate);
  addEventListener("hashchange", navigate);

  const api: CaseApi = {
    open(id, from, openerEl) {
      if (openId === null) opener = openerEl ?? (document.activeElement as HTMLElement | null);
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
    t.bind(talk, "nav.write");
    t.bind(copy, "case.copyLink");
    run(onLoad(location.hash, ctx()));
  });

  host.on("language-changed", () => {
    t.refresh();
    player.render();
    if (openId !== null) render(content().caseById(openId)!);
  });
}
