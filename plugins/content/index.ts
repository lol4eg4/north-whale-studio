// Texts and cases: picks the language, keeps every frame label in it, mounts the RU/EN switches:
// globe, RU and EN in the top bar (and on phones in the first screen, placed by the hero), the
// languages' own names in the menu. The pressed button is the language the page is in.
import type { Host } from "../../platform/host.ts";
import { binder } from "../../platform/text-binder.ts";
import { h, icon } from "../../platform/ui/parts.ts";
import type { ContentApi, Lang } from "./api.ts";
import { createStore, pickLanguage } from "./store.ts";
import "./style.css";

const LANGS: Lang[] = ["ru", "en"];
const NAMES: Record<Lang, string> = { ru: "Русский", en: "English" };

export default function init(host: Host) {
  // Only a click on the switch is remembered, under a key of its own: "lang" also kept the
  // browser's guess, which no longer counts.
  let lang = pickLanguage(location.search, host.memory.get("language"));
  const store = createStore(() => lang);

  // Frame labels: the frame marks them with keys, this plugin owns their words.
  const frame = binder(store.text);
  for (const el of document.querySelectorAll<HTMLElement>("[data-t]")) frame.bind(el, el.dataset.t!);
  for (const el of document.querySelectorAll<HTMLElement>("[data-t-label]")) frame.bind(el, el.dataset.tLabel!, "aria-label");
  for (const el of document.querySelectorAll<HTMLElement>("[data-t-cursor]")) frame.bind(el, el.dataset.tCursor!, "data-cursor");

  const switches: { show(current: Lang): void }[] = [];
  host.region("nav-lang").append(switcher(false).el);
  host.region("menu-lang").append(switcher(true).el);

  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  const showLanguage = () => {
    document.documentElement.lang = lang;
    document.title = store.text("meta.title");
    description?.setAttribute("content", store.text("meta.description"));
    for (const s of switches) s.show(lang);
  };
  showLanguage();

  const api: ContentApi = {
    language: () => lang,
    languageSwitch: () => switcher(false).el,
    setLanguage(next) {
      if (next === lang || !LANGS.includes(next)) return;
      lang = next;
      host.memory.set("language", lang);
      const url = new URL(location.href);
      url.searchParams.set("lang", lang);
      history.replaceState(history.state, "", url);
      showLanguage();
      frame.refresh();
      host.emit("language-changed", { lang });
    },
    ...store,
  };
  host.provide("content", api);
  // Back and Forward bring back an address with its own ?lang: the page follows it.
  addEventListener("popstate", () => {
    const asked = new URLSearchParams(location.search).get("lang");
    if (asked === "ru" || asked === "en") api.setLanguage(asked);
  });

  // named: the languages' own names (the menu); otherwise a globe and RU / EN.
  function switcher(named: boolean): { el: HTMLElement; show(current: Lang): void } {
    const buttons = LANGS.map((l) => {
      const b = h("button", { type: "button", lang: l, "aria-pressed": "false" }, named ? NAMES[l] : l.toUpperCase());
      b.addEventListener("click", () => api.setLanguage(l));
      return b;
    });
    const s = {
      el: h("div", { class: named ? "lang lang-named" : "lang", role: "group" }, named ? null : icon("globe", 18), ...buttons),
      show(current: Lang) {
        buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(LANGS[i] === current)));
      },
    };
    frame.bind(s.el, "lang.switch", "aria-label");
    s.show(lang);
    switches.push(s);
    return s;
  }
}
