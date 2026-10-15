// Footer: the giant slogan fitted to the width, one piece per letter (T§4.12), and the row
// below: copyright, section links, Telegram (a link once the studio has sent it). Every item is a piece.
import type { Host } from "../../platform/host.ts";
import { SECTIONS } from "../../platform/frame/frame.ts";
import type { PieceKind } from "../../platform/motion.ts";
import { binder } from "../../platform/text-binder.ts";
import { h, stamp } from "../../platform/ui/parts.ts";
import type { ContentApi } from "../content/api.ts";
import { splitLetters } from "./letters.ts";
import "./style.css";


export default function init(host: Host) {
  const content = host.use<ContentApi>("content");
  const motion = host.motion;
  const t = binder(content.text);
  const foot = host.region("footer");

  const piece = <E extends HTMLElement>(el: E, kind: PieceKind): E => {
    motion.add(el, { kind });
    t.bind(el, "cursor.drag", "data-cursor");
    return el;
  };

  const line = h("span", { class: "foot-line" });
  const word = h("div", { class: "foot-word", role: "img" }, line);
  t.bind(word, "foot.slogan", "aria-label");

  const links = SECTIONS.flatMap(([href, key], i) => {
    const a = piece(t.bind(h("a", { href }), key), "word");
    return i ? [h("span", { class: "dot foot-dot", "aria-hidden": "true" }), a] : [a];
  });
  const nav = t.bind(h("nav", { class: "foot-nav" }, ...links), "nav.sections", "aria-label");
  const tg = content.contacts().messengers.find((m) => m.name === "Telegram")?.url;
  const telegram = piece(
    tg ? h("a", { class: "foot-tg", href: tg, target: "_blank", rel: "noopener" }, "Telegram") : h("span", { class: "foot-tg" }, "Telegram", t.bind(stamp(""), "placeholder.stamp")),
    "word",
  );
  const row = h("div", { class: "foot-row mono" }, piece(t.bind(h("span"), "foot.copy"), "word"), nav, telegram);
  foot.append(word, row);

  // Letters: rebuilt on language change; the pieces of the old ones go away with them.
  let letters: number[] = [];
  const build = () => {
    for (const id of letters) motion.remove(id);
    const label = content.text("cursor.drag");
    line.replaceChildren(
      ...splitLetters(content.text("foot.slogan")).map((l) =>
        l.space
          ? h("span", { class: "foot-gap" }, " ")
          : h(
              "span",
              {
                class: `fl${l.up ? " up" : ""}`,
                "aria-hidden": "true",
                "data-cursor": label,
                style: `--c:${l.colour};--rr:${l.turn}deg;--r:${l.tilt}deg`,
              },
              l.ch,
            ),
      ),
    );
    letters = [...line.querySelectorAll<HTMLElement>(".fl")].map((el) => motion.add(el, { kind: "letter" }));
    fit();
  };

  // Fit the line to the container: measure at 100 px, scale to the width (mock fit()).
  let fittedWidth = 0;
  function fit() {
    const width = word.clientWidth;
    if (!width) return;
    word.style.fontSize = "100px";
    const natural = line.getBoundingClientRect().width;
    if (natural) word.style.fontSize = `${((100 * width) / natural) * 0.995}px`;
    fittedWidth = width;
  }
  new ResizeObserver(() => {
    if (word.clientWidth !== fittedWidth) fit();
  }).observe(word);
  document.fonts?.ready.then(fit);

  // Touch has no hover: a tapped letter lights up for a moment.
  line.addEventListener("pointerdown", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".fl");
    if (!el || e.pointerType === "mouse") return;
    el.classList.add("on");
    setTimeout(() => el.classList.remove("on"), 450);
  });

  build();
  host.on("language-changed", () => {
    t.refresh();
    build();
  });
}
