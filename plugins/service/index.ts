// Service card: a black sticker card over the page (a bottom sheet on phones).
// Title, one phrase, what is included; «Обсудить проект» goes to contacts, «Смотреть кейсы» to the wall.
import type { Host } from "../../platform/host.ts";
import { binder } from "../../platform/text-binder.ts";
import { button, h, icon, overlay } from "../../platform/ui/parts.ts";
import type { ContentApi } from "../content/api.ts";
import type { ServiceApi } from "./api.ts";
import "./style.css";

// Same as following a link to that anchor, without reading anyone's markup.
const goTo = (hash: string) => h("a", { href: hash }).click();

export default function init(host: Host) {
  const { motion } = host;
  const content = () => host.use<ContentApi>("content");
  const t = binder((key) => content().text(key));

  const close = () => {
    dlg.close();
  };
  const dlg = overlay("svc-card", close);
  dlg.el.setAttribute("aria-labelledby", "svc-title");

  const label = h("span", { class: "mono" });
  const x = h("button", { type: "button", class: "sc-x" }, icon("close", 14));
  const title = h("h2", { id: "svc-title" });
  const phrase = h("p", { class: "sc-lede" });
  const list = h("ul");
  const talk = button("", "action");
  const cases = button("", "outline");
  const card = h(
    "div",
    { class: "sc on-ink" },
    h("div", { class: "sc-top" }, label, x),
    title,
    phrase,
    list,
    h("div", { class: "sc-actions" }, talk, cases),
  );
  dlg.el.append(card);

  let shown: number | null = null;
  const render = () => {
    const s = content().services().find((v) => v.id === shown);
    if (!s) return;
    label.textContent = content().text(s.main ? "service.main" : "service.label");
    title.textContent = s.title;
    phrase.textContent = s.phrase;
    list.replaceChildren(...s.includes.map((line) => h("li", {}, line)));
  };

  const leave = (hash: string) => {
    dlg.close(false);
    goTo(hash);
  };
  x.addEventListener("click", close);
  talk.addEventListener("click", () => leave("#contacts"));
  cases.addEventListener("click", () => leave("#cases"));
  dlg.el.addEventListener("close", () => (shown = null));

  host.provide<ServiceApi>("service", {
    open(id, opener) {
      if (!content().services().some((v) => v.id === id)) return;
      shown = id;
      render();
      dlg.open(opener);
      x.focus();
      if (!motion.calm) {
        const phone = matchMedia("(max-width: 700px)").matches;
        card.animate(
          phone
            ? [{ transform: "translateY(100%)" }, { transform: "none" }]
            : [{ transform: "translateY(24px) scale(.94)", opacity: 0 }, { transform: "none", opacity: 1 }],
          { duration: phone ? 420 : 520, easing: motion.spring.easing },
        );
      }
      host.emit("service-opened", { id });
    },
  });

  host.ready(() => {
    t.bind(x, "service.close", "aria-label");
    t.bind(x, "cursor.close", "data-cursor");
    t.bind(talk, "service.discuss");
    t.bind(cases, "service.cases");
  });

  host.on("language-changed", () => {
    t.refresh();
    render();
  });
}
