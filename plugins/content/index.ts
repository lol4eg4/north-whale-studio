// Texts and cases: picks the language, keeps every frame label in it, mounts the RU/EN switch.
import type { Host } from "../../platform/host.ts";
import { binder } from "../../platform/text-binder.ts";
import { h } from "../../platform/ui/parts.ts";
import type { ContentApi, Lang } from "./api.ts";
import { createStore, pickLanguage } from "./store.ts";
import "./style.css";

const LANGS: Lang[] = ["ru", "en"];

export default function init(host: Host) {
  let lang = pickLanguage(location.search, host.memory.get("lang"), navigator.languages?.length ? navigator.languages : [navigator.language]);
  host.memory.set("lang", lang);
  const store = createStore(() => lang);

  // Frame labels: the frame marks them with keys, this plugin owns their words.
  const frame = binder(store.text);
  for (const el of document.querySelectorAll<HTMLElement>("[data-t]")) frame.bind(el, el.dataset.t!);
  for (const el of document.querySelectorAll<HTMLElement>("[data-t-label]")) frame.bind(el, el.dataset.tLabel!, "aria-label");
  for (const el of document.querySelectorAll<HTMLElement>("[data-t-cursor]")) frame.bind(el, el.dataset.tCursor!, "data-cursor");

  const switches = [switcher(), switcher()];
  host.region("nav-lang").append(switches[0].el);
  host.region("menu-lang").append(switches[1].el);
  for (const s of switches) frame.bind(s.el, "lang.switch", "aria-label");

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
    setLanguage(next) {
      if (next === lang || !LANGS.includes(next)) return;
      lang = next;
      host.memory.set("lang", lang);
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

  function switcher() {
    const buttons = LANGS.map((l) => {
      const b = h("button", { type: "button", lang: l, "aria-pressed": "false" }, l.toUpperCase());
      b.addEventListener("click", () => api.setLanguage(l));
      return b;
    });
    return {
      el: h("div", { class: "lang", role: "group" }, ...buttons),
      show(current: Lang) {
        buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(LANGS[i] === current)));
      },
    };
  }
}
