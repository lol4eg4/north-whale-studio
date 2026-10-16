// Manifesto: how the studio works. Left column sticks above 860 px; starred phrases are
// highlighter marks that draw in once they scroll into view (at once in calm).
//
//   section#manifesto  [pill, h2 words, studio story] [3 big paragraphs, h3, body]
import type { Host } from "../../platform/host.ts";
import type { PieceKind } from "../../platform/motion.ts";
import { binder } from "../../platform/text-binder.ts";
import { h } from "../../platform/ui/parts.ts";
import type { ContentApi } from "../content/api.ts";
import { parseMarks } from "./marks.ts";
import "./style.css";

const PARAGRAPHS: [key: string, colour: string][] = [
  ["mani.p1", ""],
  ["mani.p2", "b"],
  ["mani.p3", "m"],
];

export default function init(host: Host) {
  const content = host.use<ContentApi>("content");
  const motion = host.motion;
  const t = binder(content.text);

  const piece = <E extends HTMLElement>(el: E, kind: PieceKind): E => {
    motion.add(el, { kind });
    t.bind(el, "cursor.drag", "data-cursor");
    return el;
  };

  const pill = piece(t.bind(h("span", { class: "mani-pill mono" }), "mani.kicker"), "sticker");
  const title = h("h2", { class: "mani-h", id: "mani-h" });
  const origin = piece(t.bind(h("p", { class: "mani-origin" }), "mani.origin"), "block");
  const paragraphs = PARAGRAPHS.map(([key, colour]) => ({ key, colour, el: piece(h("p", { class: "mani-big" }), "block") }));
  const why = piece(t.bind(h("h3", { class: "mani-why" }), "mani.whyTitle"), "block");
  const body = piece(t.bind(h("p", { class: "mani-body" }), "mani.whyBody"), "block");

  host.region("main").append(
    h(
      "section",
      { class: "mani", id: "manifesto", "aria-labelledby": "mani-h" },
      h("div", { class: "mani-l" }, pill, title, origin),
      h("div", { class: "mani-r" }, ...paragraphs.map((p) => p.el), why, body),
    ),
  );

  // Headline words: one piece each, rebuilt when the language changes.
  let words: number[] = [];
  const buildTitle = () => {
    for (const id of words) motion.remove(id);
    const parts = content.text("mani.title").split(/(\s+)/).filter(Boolean);
    title.replaceChildren(...parts.map((w) => (/^\s+$/.test(w) ? w : h("span", { class: "w", "data-cursor": content.text("cursor.drag") }, w))));
    words = [...title.querySelectorAll<HTMLElement>(".w")].map((w) => motion.add(w, { kind: "word" }));
  };

  // Marks: drawn once when they reach 85 % of the viewport height.
  const drawn = new WeakSet<HTMLElement>();
  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              e.target.classList.remove("pre");
              drawn.add(e.target.parentElement!);
              io!.unobserve(e.target);
            }
          },
          { rootMargin: "0px 0px -15% 0px" },
        )
      : null;
  const fillParagraph = (p: (typeof paragraphs)[number]) => {
    for (const m of p.el.querySelectorAll("mark")) io?.unobserve(m);
    const instant = motion.calm || !io || drawn.has(p.el);
    p.el.replaceChildren(
      ...parseMarks(content.text(p.key)).map((run) => {
        if (!run.mark) return run.text;
        const cls = [p.colour, instant ? "" : "pre"].filter(Boolean).join(" ");
        return h("mark", { class: cls || null }, run.text);
      }),
    );
    if (!instant) for (const m of p.el.querySelectorAll("mark")) io!.observe(m);
  };

  buildTitle();
  paragraphs.forEach(fillParagraph);

  motion.onChange(() => {
    if (!motion.calm) return;
    for (const p of paragraphs) {
      drawn.add(p.el);
      for (const m of p.el.querySelectorAll("mark")) {
        m.classList.remove("pre");
        io?.unobserve(m);
      }
    }
  });

  host.on("language-changed", () => {
    t.refresh();
    buildTitle();
    paragraphs.forEach(fillParagraph);
  });
}
