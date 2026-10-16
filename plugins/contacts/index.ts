// Contacts: the big «Напишите нам», the studio's email (a mailto: link, never a piece) with the
// copy button, the messengers and socials: a link where the studio sent an address, a stamped
// placeholder until then. A group with no entries is left out.
//
//   copy ok        -> label «Скопировано» 2.4 s + toast + email-copied
//   copy refused   -> the address is selected + hint toast
import type { Host } from "../../platform/host.ts";
import type { PieceKind } from "../../platform/motion.ts";
import { binder } from "../../platform/text-binder.ts";
import { h, icon, stamp, toast } from "../../platform/ui/parts.ts";
import type { ContentApi } from "../content/api.ts";
import "./style.css";

export default function init(host: Host) {
  const content = host.use<ContentApi>("content");
  const motion = host.motion;
  const t = binder(content.text);
  const data = content.contacts();
  const mailto = `mailto:${data.email}`;

  const piece = <E extends HTMLElement>(el: E, kind: PieceKind): E => {
    motion.add(el, { kind });
    t.bind(el, "cursor.drag", "data-cursor");
    return el;
  };
  const stamped = () => t.bind(stamp(""), "placeholder.stamp");

  const kicker = piece(t.bind(h("div", { class: "contact-kick mono" }), "contacts.kicker"), "block");
  const title = h("h2", { class: "contact-say", id: "contacts-h" });
  const lede = piece(t.bind(h("p", { class: "contact-lede" }), "contacts.lede"), "block");

  const email = t.bind(h("a", { class: "contact-email", href: mailto }, data.email), "cursor.write", "data-cursor");
  const copyLabel = h("span");
  const copy = piece(h("button", { type: "button", class: "btn contact-copy" }, icon("check", 16), copyLabel), "sticker");

  // Messengers and socials: a chip with an address is a link; the rest are stamped placeholders.
  const link = (label: string, url: string) => {
    const a = h("a", { class: "btn", href: url, target: "_blank", rel: "noopener" }, label);
    motion.add(a, { kind: "sticker" });
    return t.bind(a, "cursor.write", "data-cursor");
  };
  const group = (labelKey: string, items: { label: string; url?: string }[]) =>
    items.length > 0 &&
    h(
      "div",
      { class: "contact-group" },
      t.bind(h("span", { class: "mono contact-group-name" }), labelKey),
      ...items.map(({ label, url }) => (url ? link(label, url) : piece(h("span", { class: "contact-ph" }, label), "sticker"))),
      ...(items.some((i) => !i.url) ? [stamped()] : []),
    );

  host.region("main").append(
    h(
      "section",
      { class: "contact", id: "contacts", "aria-labelledby": "contacts-h" },
      kicker,
      title,
      lede,
      h("div", { class: "contact-row" }, email, copy),
      h(
        "div",
        { class: "contact-reach" },
        group("contacts.messengers", data.messengers.map((m) => ({ label: `${m.name} ${m.handle}`, url: m.url }))),
        group("contacts.socials", data.socials.map((s) => ({ label: s.name }))),
      ),
    ),
  );

  // The menu (<= 1100 px) shows the address too, in mono.
  host.region("menu-foot").append(h("p", { class: "menu-mail mono" }, h("a", { href: mailto }, data.email)));

  // Headline words: one piece each, rebuilt when the language changes.
  let words: number[] = [];
  const buildTitle = () => {
    for (const id of words) motion.remove(id);
    const parts = content.text("contacts.title").split(/(\s+)/).filter(Boolean);
    title.replaceChildren(...parts.map((w) => (/^\s+$/.test(w) ? w : h("span", { class: "w", "data-cursor": content.text("cursor.drag") }, w))));
    words = [...title.querySelectorAll<HTMLElement>(".w")].map((w) => motion.add(w, { kind: "word" }));
  };

  let copied = false;
  let copiedTimer = 0;
  const showLabel = () => {
    copyLabel.textContent = content.text(copied ? "contacts.copied" : "contacts.copy");
    copy.classList.toggle("done", copied);
  };

  copy.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("No clipboard");
      await navigator.clipboard.writeText(data.email);
    } catch {
      // The browser said no: select the address so one keystroke copies it.
      const range = document.createRange();
      range.selectNodeContents(email);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      toast(content.text("contacts.copyFail"), 3200);
      return;
    }
    copied = true;
    showLabel();
    clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copied = false;
      showLabel();
    }, 2400);
    toast(content.text("contacts.toast"));
    host.emit("email-copied", {});
  });

  buildTitle();
  showLabel();
  host.on("language-changed", () => {
    t.refresh();
    buildTitle();
    showLabel();
  });
}
