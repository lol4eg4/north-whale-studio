// Contacts: the big «Напишите нам», calls to write to the studio's Telegram bot (a big link, never
// a piece) and to its support account, the QR card to the bot (computer and tablet; phones get the
// buttons only), and
// the socials: a stamped placeholder until the studio sends an address. No socials: no group.
// Every contact link opens in a new tab.
import type { Host } from "../../platform/host.ts";
import type { PieceKind } from "../../platform/motion.ts";
import { binder } from "../../platform/text-binder.ts";
import { h, stamp } from "../../platform/ui/parts.ts";
import type { ContentApi } from "../content/api.ts";
import "./style.css";

const out = { target: "_blank", rel: "noopener" };

export default function init(host: Host) {
  const content = host.use<ContentApi>("content");
  const motion = host.motion;
  const t = binder(content.text);
  const { bot, support, socials } = content.contacts();
  const cta = (cls: string, url: string, key: string) => t.bind(t.bind(h("a", { class: cls, href: url, ...out }), key), "cursor.write", "data-cursor");

  const piece = <E extends HTMLElement>(el: E, kind: PieceKind): E => {
    motion.add(el, { kind });
    t.bind(el, "cursor.drag", "data-cursor");
    return el;
  };

  const kicker = piece(t.bind(h("div", { class: "contact-kick mono" }), "contacts.kicker"), "block");
  const title = h("h2", { class: "contact-say", id: "contacts-h" });
  const lede = piece(t.bind(h("p", { class: "contact-lede" }), "contacts.lede"), "block");

  const botLink = cta("contact-bot", bot.url, "contacts.botCta");
  const supportLink = cta("btn", support.url, "contacts.supportCta");
  motion.add(supportLink, { kind: "sticker" });

  const qrImg = t.bind(h("img", { src: "/qr-bot.svg", width: "220", height: "220", loading: "lazy", draggable: "false" }), "contacts.qrAlt", "alt");
  const qr = piece(h("a", { class: "contact-qr", href: bot.url, ...out }, qrImg, t.bind(h("span", { class: "mono" }), "contacts.qrHint")), "sticker");

  const socialGroup =
    socials.length > 0 &&
    h(
      "div",
      { class: "contact-group" },
      t.bind(h("span", { class: "mono contact-group-name" }), "contacts.socials"),
      ...socials.map((s) => piece(h("span", { class: "contact-ph" }, s.name), "sticker")),
      t.bind(stamp(""), "placeholder.stamp"),
    );

  host.region("main").append(
    h(
      "section",
      { class: "contact", id: "contacts", "aria-labelledby": "contacts-h" },
      kicker,
      title,
      lede,
      h(
        "div",
        { class: "contact-body" },
        h(
          "div",
          { class: "contact-reach" },
          h("div", { class: "contact-calls" }, botLink, supportLink),
          socialGroup,
        ),
        qr,
      ),
    ),
  );

  // The menu (<= 1100 px) links the bot too, in mono, like the footer.
  host.region("menu-foot").append(h("p", { class: "menu-tg mono" }, h("a", { href: bot.url, ...out }, "Telegram")));

  // Headline words: one piece each, rebuilt when the language changes.
  let words: number[] = [];
  const buildTitle = () => {
    for (const id of words) motion.remove(id);
    const parts = content.text("contacts.title").split(/(\s+)/).filter(Boolean);
    title.replaceChildren(...parts.map((w) => (/^\s+$/.test(w) ? w : h("span", { class: "w", "data-cursor": content.text("cursor.drag") }, w))));
    words = [...title.querySelectorAll<HTMLElement>(".w")].map((w) => motion.add(w, { kind: "word" }));
  };

  buildTitle();
  host.on("language-changed", () => {
    t.refresh();
    buildTitle();
  });
}
