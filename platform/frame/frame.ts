// The page frame: top bar, menu, the regions plugins fill, the two bottom corners and the
// pause button. Labels carry data-t / data-t-label keys; the content plugin fills them.
//
//   header.nav  [studio name] [links] [Кейсы] [Написать нам] [nav-lang] [+]
//   main        region "main"      (hero, wall, manifesto, contacts)
//   footer      region "footer"
//   section     region "finale"    (slingshot)
//   .ctrl       region "corner-left"  (sound) + pause
//   .dock       region "corner-right" (dive, tidy)
//   dialog      menu at <= 1100 px: sections, region "menu-lang", region "menu-foot"
import type { Motion } from "../motion.ts";
import type { RegionName } from "../host.ts";
import { h, icon } from "../ui/parts.ts";

// The page's sections in order, with their label keys (the footer lists them too).
export const SECTIONS: [string, string][] = [
  ["#cases", "nav.cases"],
  ["#services", "nav.services"],
  ["#manifesto", "nav.manifesto"],
  ["#team", "nav.team"],
  ["#contacts", "nav.contacts"],
];

export function mountFrame(motion: Motion): Partial<Record<RegionName, HTMLElement>> {
  const body = document.body;

  const name = h("a", { class: "logo", href: "#top", "data-t-cursor": "cursor.hi" }, h("span", {}, "North Whale Studio", h("sup", { "aria-hidden": "true" }, "©")));
  const links = h(
    "nav",
    { class: "links", "data-t-label": "nav.sections" },
    ...SECTIONS.slice(1).map(([href, key]) => h("a", { href, "data-t": key })),
  );
  const casesPill = h("a", { class: "pill cases-pill", href: "#cases" }, h("span", { class: "badge" }), h("span", { "data-t": "nav.cases" }));
  const hello = h("a", { class: "pill hello-pill", href: "#contacts", "data-t": "nav.write" });
  const helloShort = h("a", { class: "pill hello-short", href: "#contacts", "data-t": "nav.writeShort" });
  const navLang = h("span", { class: "nav-lang" });
  const plus = h("button", { class: "plus", type: "button", "aria-expanded": "false", "aria-controls": "menu", "data-t-label": "nav.menuOpen" }, icon("plus", 22));
  const header = h("header", { class: "nav" }, name, links, casesPill, hello, helloShort, navLang, plus);

  const main = h("main", { id: "top" });
  const footer = h("footer", { class: "foot" });
  const finale = h("section", { class: "finale", id: "finale" });

  const pause = h(
    "button",
    { class: "cbtn pause-btn", type: "button", "aria-pressed": String(motion.stopped), "data-t-label": "motion.pause" },
    icon(motion.stopped ? "motionPlay" : "motionPause", 18),
  );
  // The button shows the visitor's own pause: in calm the wall's loops still play until it is pressed.
  pause.addEventListener("click", () => motion.setPaused(!motion.stopped));
  motion.onChange(() => {
    pause.setAttribute("aria-pressed", String(motion.stopped));
    pause.replaceChildren(icon(motion.stopped ? "motionPlay" : "motionPause", 18));
  });
  const cornerLeft = h("div", { class: "ctrl" }, pause);
  const cornerRight = h("div", { class: "dock" });

  // Menu: a modal sheet with its own top bar, so focus stays inside and Esc closes it.
  const menuClose = h("button", { class: "plus open", type: "button", "data-t-label": "nav.menuClose" }, icon("plus", 22));
  const menuLang = h("div", { class: "menu-lang" }, h("span", { class: "mono", "data-t": "nav.language" }));
  const menuFoot = h("div", { class: "menu-foot" }, h("a", { class: "pill hello-pill", href: "#contacts", "data-t": "nav.write" }));
  const menu = h(
    "dialog",
    { class: "sheet menu", id: "menu", "data-t-label": "nav.menu" },
    h("div", { class: "menu-top" }, h("span", { class: "logo" }, h("span", {}, "North Whale Studio", h("sup", { "aria-hidden": "true" }, "©"))), menuClose),
    h("nav", { class: "menu-links" }, ...SECTIONS.map(([href, key]) => h("a", { href, "data-t": key }))),
    menuLang,
    menuFoot,
  );
  const setMenu = (open: boolean) => {
    if (open && !menu.open) menu.showModal();
    if (!open && menu.open) menu.close();
    plus.setAttribute("aria-expanded", String(open));
    document.documentElement.classList.toggle("menu-open", open);
  };
  plus.addEventListener("click", () => setMenu(!menu.open));
  menuClose.addEventListener("click", () => {
    setMenu(false);
    plus.focus();
  });
  menu.addEventListener("close", () => setMenu(false));
  menu.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target === menu || target.closest("a")) setMenu(false);
  });
  matchMedia("(min-width: 1101px)").addEventListener("change", (e) => e.matches && setMenu(false));

  body.append(header, main, footer, finale, cornerLeft, cornerRight, menu);
  motion.add(name, { kind: "nav", target: true });

  return {
    "nav-lang": navLang,
    "menu-lang": menuLang,
    "menu-foot": menuFoot,
    main,
    footer,
    finale,
    "corner-left": cornerLeft,
    "corner-right": cornerRight,
    overlay: body,
  };
}
