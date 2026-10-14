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

export type ButtonKind = "outline" | "dark" | "action" | "ghost";
export function button(label: string, kind: ButtonKind = "outline", attrs: Attrs = {}): HTMLButtonElement {
  const cls = { outline: "btn", dark: "btn btn-dark", action: "btn btn-action", ghost: "btn btn-ghost" }[kind];
  return h("button", { type: "button", ...attrs, class: `${cls} ${attrs.class ?? ""}`.trim() }, label);
}

// Paper sticker with the white die-cut edge. Tilt goes into --r so a lift still tilts it.
export function sticker(className: string, tilt: number, ...children: Child[]): HTMLDivElement {
  return h("div", { class: `sticker ${className}`, style: `--r:${tilt.toFixed(1)}deg` }, ...children);
}

// Hand-written marker note with an arrow (left or up).
export function note(text: string, arrow: "left" | "up" | "none" = "left"): HTMLSpanElement {
  const el = h("span", { class: "note" }, h("span", { class: "note-text" }, text));
  if (arrow !== "none") el.append(icon(arrow === "left" ? "arrowLeft" : "arrowUp", arrow === "left" ? 90 : 70));
  return el;
}

// The red «заглушка» stamp: marks a place waiting for the studio's own data.
export function stamp(text: string): HTMLSpanElement {
  return h("span", { class: "stamp" }, text);
}

export function placeholderBox(text: string, tag: "div" | "p" = "div"): HTMLElement {
  return h(tag, { class: "ph-box" }, text);
}

// Toast: one polite live region for the whole page.
let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;
export function toast(text: string, ms = 2200) {
  if (!toastEl) {
    toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite", hidden: true });
    document.body.append(toastEl);
  }
  toastEl.textContent = text;
  toastEl.hidden = false;
  if (!document.documentElement.classList.contains("calm"))
    toastEl.animate([{ transform: "translateY(-12px) scale(.9)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 380, easing: "cubic-bezier(.34,1.56,.64,1)" });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl!.hidden = true), ms);
}

// Window over the page (native modal dialog: focus stays inside, the page behind is inert).
// Esc and a click outside ask the owner to close, so the owner can keep history in step.
export function overlay(className: string, onRequestClose: () => void) {
  const el = h("dialog", { class: `sheet ${className}` });
  let opener: HTMLElement | null = null;
  el.addEventListener("cancel", (e) => {
    e.preventDefault();
    onRequestClose();
  });
  el.addEventListener("click", (e) => {
    if (e.target === el) onRequestClose();
  });
  document.body.append(el);
  return {
    el,
    get isOpen() {
      return el.open;
    },
    open(from?: HTMLElement | null) {
      opener = from ?? (document.activeElement as HTMLElement | null);
      if (!el.open) el.showModal();
    },
    close(returnFocus = true) {
      if (!el.open) return;
      el.close();
      if (returnFocus && opener?.isConnected) opener.focus({ preventScroll: true });
    },
    setOpener(from: HTMLElement | null) {
      opener = from;
    },
  };
}
export type Overlay = ReturnType<typeof overlay>;
