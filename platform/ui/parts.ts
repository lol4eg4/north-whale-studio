// Shared parts. A part shows only what it is given: no data lookups, no addresses, no plugins.
import { icons, type IconName } from "./icons.ts";

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | number | null | undefined | false;

// Element helper: attributes and text children only (never HTML strings from data).
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    el.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child instanceof Node ? child : String(child));
  return el;
}

// Own icons (static markup from icons.ts, never from data).
export function icon(name: IconName, size = 20): SVGSVGElement {
  const t = document.createElement("template");
  t.innerHTML = icons[name].trim();
  const svg = t.content.firstElementChild as SVGSVGElement;
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  return svg;
}

export type ButtonKind = "outline" | "action" | "ghost";
export function button(label: string, kind: ButtonKind = "outline", attrs: Attrs = {}): HTMLButtonElement {
  const cls = { outline: "btn", action: "btn btn-action", ghost: "btn btn-ghost" }[kind];
  return h("button", { type: "button", ...attrs, class: `${cls} ${attrs.class ?? ""}`.trim() }, label);
}

// Hand-written marker note with an arrow (left or up).
export function note(text: string, arrow: "left" | "up" | "none" = "left"): HTMLSpanElement {
  const el = h("span", { class: "note" }, h("span", { class: "note-text" }, text));
  if (arrow !== "none") el.append(icon(arrow === "left" ? "arrowLeft" : "arrowUp", arrow === "left" ? 90 : 70));
  return el;
}

// A marker note writes itself in, left to right, the first time it is on screen (.pre / .written
// in parts.css; calm shows it at once). .late: it came on screen after load, scrolled to, so it
// waits behind no other note.
export function writeIn(el: HTMLElement): void {
  if (!("IntersectionObserver" in window)) return;
  el.classList.add("pre");
  let first = true; // the first callback is the state at load
  const io = new IntersectionObserver(([e]) => {
    const late = !first;
    first = false;
    if (!e.isIntersecting) return;
    io.disconnect();
    el.classList.replace("pre", "written");
    el.classList.toggle("late", late);
  });
  io.observe(el);
}

// The red «заглушка» stamp: marks a place waiting for the studio's own data.
export function stamp(text: string): HTMLSpanElement {
  return h("span", { class: "stamp" }, text);
}

export function placeholderBox(text: string, tag: "div" | "p" = "div"): HTMLElement {
  return h(tag, { class: "ph-box" }, text);
}

// A touch screen, phone or tablet (headless browsers report hover:none, so not that).
export const isTouch = () => matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

// Go to an anchor the way a link does: it scrolls there even when the address already has it.
export const goTo = (hash: string) => h("a", { href: hash }).click();

// Where floating things go: into the open modal dialog (the browser's top layer), else the page.
export const topLayer = (): HTMLElement => [...document.querySelectorAll<HTMLElement>("dialog[open]")].pop() ?? document.body;

// Toast: one polite live region for the whole page.
let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;
export function toast(text: string, ms = 2200) {
  const el = (toastEl ??= h("div", { class: "toast", role: "status", "aria-live": "polite", hidden: true }));
  const show = () => {
    el.textContent = text;
    el.hidden = false;
    if (!document.documentElement.classList.contains("calm"))
      el.animate([{ transform: "translateY(-12px) scale(.9)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 380, easing: "cubic-bezier(.34,1.56,.64,1)" });
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (el.hidden = true), ms);
  };
  // Inside an open modal dialog, so it is seen and read there. A live region that just moved is
  // read only when its text changes after it is in place: the text comes a frame later.
  const layer = topLayer();
  if (el.parentElement === layer) return show();
  layer.append(el);
  requestAnimationFrame(show);
}

// Window over the page (native modal dialog: focus stays inside, the page behind is inert).
// Esc and a click outside ask the owner to close, so the owner can keep history in step.
export function overlay(className: string, onRequestClose: () => void) {
  const el = h("dialog", { class: `sheet ${className}` });
  let opener: HTMLElement | null = null;
  let downOutside = false;
  el.addEventListener("cancel", (e) => {
    e.preventDefault();
    onRequestClose();
  });
  // Outside means pressed and released there: a text selection let go past the edge stays open.
  el.addEventListener("pointerdown", (e) => (downOutside = e.target === el));
  el.addEventListener("click", (e) => {
    if (e.target === el && downOutside) onRequestClose();
  });
  document.body.append(el);
  return {
    el,
    open(from?: HTMLElement | null) {
      opener = from ?? (document.activeElement as HTMLElement | null);
      if (!el.open) el.showModal();
    },
    close(returnFocus = true) {
      if (!el.open) return;
      el.close();
      if (returnFocus && opener?.isConnected) opener.focus({ preventScroll: true });
    },
  };
}
