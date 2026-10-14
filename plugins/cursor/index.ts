// Custom cursor (T§4.11): a small whale with a label pill, for mouse-like pointers only.
// The label is the data-cursor of the nearest owner element (owners translate it); while a
// piece is being dragged it says cursor.dragging. Text fields keep the browser's own cursor.
import type { Host } from "../../platform/host.ts";
import { h, topLayer } from "../../platform/ui/parts.ts";
import type { ContentApi } from "../content/api.ts";
import { cursorColors, labelKeys, wantsCursor, type CursorKey } from "./colors.ts";
import "./style.css";

const FIELD = "input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable]:not([contenteditable=false])";
const OWNER = "[data-cursor], a[href], button, [role=button], summary";

export default function init(host: Host) {
  if (!wantsCursor(matchMedia("(pointer: fine)").matches, navigator.maxTouchPoints)) return;
  const root = document.documentElement;
  const label = h("span", { class: "c-label" });
  const el = h(
    "div",
    { class: "cursor", "aria-hidden": "true" },
    h("span", { class: "c-logo" }, h("img", { src: "/whale.svg", alt: "", width: 40, height: 28 })),
    h("span", { class: "c-tag" }, label),
  );
  host.region("overlay").append(el);

  const text = (key: string) => host.use<ContentApi>("content").text(key);
  let keys = new Map<string, CursorKey>();
  let over: Element | null = null;
  let inside = false;
  let dragging = false;
  let shown = "";

  host.ready(() => (keys = labelKeys(text)));
  host.on("language-changed", () => {
    keys = labelKeys(text);
    render();
  });
  host.on("piece-grabbed", () => {
    dragging = true;
    render();
  });
  host.on("piece-dropped", () => {
    dragging = false;
    render();
  });

  function hide() {
    inside = false;
    el.classList.remove("on", "down");
    root.classList.remove("has-cursor");
  }

  function render() {
    if (!inside) return;
    const active = dragging || !over?.closest(FIELD);
    el.classList.toggle("on", active);
    root.classList.toggle("has-cursor", active);
    if (!active) return;
    const owner = dragging ? null : over?.closest<HTMLElement>(OWNER);
    const word = dragging ? text("cursor.dragging") : (owner?.dataset.cursor ?? "");
    el.classList.toggle("word", !!word);
    el.classList.toggle("link", !word && !!owner);
    if (!word || word === shown) return;
    shown = word;
    label.textContent = word;
    const c = cursorColors(dragging ? "dragging" : keys.get(word));
    el.style.setProperty("--c", c.bg);
    el.style.setProperty("--tc", c.fg);
  }

  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      // Over an open modal dialog, the cursor lives inside it (the browser's top layer).
      const layer = topLayer();
      if (el.parentElement !== layer) layer.append(el);
      el.style.translate = `${e.clientX}px ${e.clientY}px`;
      inside = true;
      over = e.target as Element;
      render();
    },
    { passive: true },
  );
  window.addEventListener("pointerdown", (e) => e.pointerType === "mouse" && el.classList.add("down"), { passive: true });
  window.addEventListener("pointerup", () => el.classList.remove("down"), { passive: true });
  document.addEventListener("mouseout", (e) => !e.relatedTarget && hide());
  window.addEventListener("blur", hide);
}
