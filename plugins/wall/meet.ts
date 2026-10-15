// Meet: a name badge opens big over the page, flying out of its place on the wall, and flies
// back the same way on a second click, the close button, Esc or a click outside.
//
//   dialog.meet > .meet-box (a wall cell's shape, size container) > .meet-card > [badge copy, ×]
//   the card animates from the badge's place, size and tilt to the middle (FLIP)
import type { Motion } from "../../platform/motion.ts";
import { h, icon, overlay } from "../../platform/ui/parts.ts";

const OPEN = "cubic-bezier(.3,1.3,.5,1)";
const BACK = "cubic-bezier(.5,0,.7,-.3)"; // OPEN played backwards
const TILT = "rotate(-1.5deg)";
const DIM = "rgba(14, 14, 14, 0.45)";

export function createMeet(motion: Motion, closeText: () => string, cursorText: () => string) {
  const dlg = overlay("meet", () => close());
  const x = h("button", { type: "button", class: "meet-x" }, icon("close", 14), h("span"));
  const card = h("div", { class: "meet-card" });
  const box = h("div", { class: "meet-box" }, card);
  dlg.el.append(box);

  let badge: HTMLElement | null = null;
  let closing = false;

  // The badge's place on screen as a transform of the card: centre, size and tilt. The card sits
  // in the middle of the box, which never moves.
  const from = () => {
    const a = badge!.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const k = badge!.offsetWidth / card.offsetWidth;
    const r = Number.parseFloat(getComputedStyle(badge!).rotate) || 0;
    return `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${k}) rotate(${r}deg)`;
  };
  const still = () => motion.calm || !badge?.isConnected;

  const open = (el: HTMLElement, label: string, photo: string, video: string | null) => {
    if (badge) return;
    badge = el;
    closing = false;
    const copy = el.cloneNode(true) as HTMLElement;
    copy.className = "sticker tag";
    copy.removeAttribute("style");
    copy.removeAttribute("aria-label");
    copy.removeAttribute("data-cursor");
    copy.tabIndex = -1;
    copy.querySelector("img")?.setAttribute("src", photo);
    // A badge with a video plays it like the wall does: never in calm or with the pause on, where
    // the photo shows. The copy has no listeners of its own, so it shows the video once it plays.
    const clip = copy.querySelector("video");
    if (clip) {
      const spot = clip.parentElement!;
      if (video && !motion.calm && !motion.paused) {
        clip.muted = true;
        clip.addEventListener("playing", () => spot.classList.add("shown"));
        clip.src = video;
        void clip.play().catch(() => {});
      } else {
        spot.classList.remove("shown");
        clip.removeAttribute("src");
      }
    }
    dlg.el.setAttribute("aria-label", label);
    x.setAttribute("aria-label", closeText());
    x.lastElementChild!.textContent = closeText();
    card.dataset.cursor = cursorText();
    card.replaceChildren(copy, x);
    dlg.open(el);
    x.focus();
    el.classList.add("meeting");
    if (still()) {
      card.style.transform = TILT;
      return;
    }
    card.animate([{ transform: from() }, { transform: TILT }], { duration: 700, easing: OPEN, fill: "both" });
    x.animate([{ opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1 }], { duration: 300, delay: 480, easing: OPEN, fill: "backwards" });
    dlg.el.animate([{ backgroundColor: "transparent" }, { backgroundColor: DIM }], { duration: 300 });
  };

  const done = () => {
    for (const a of [...card.getAnimations(), ...x.getAnimations(), ...dlg.el.getAnimations()]) a.cancel();
    card.style.transform = "";
    card.replaceChildren();
    badge?.classList.remove("meeting");
    dlg.close();
    badge = null;
    closing = false;
  };

  function close() {
    if (!badge || closing) return;
    closing = true;
    if (still()) return done();
    const back = card.animate([{ transform: TILT }, { transform: from() }], { duration: 520, easing: BACK, fill: "forwards" });
    x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" });
    dlg.el.animate([{ backgroundColor: DIM }, { backgroundColor: "transparent" }], { duration: 520, fill: "forwards" });
    void back.finished.then(done);
  }

  card.addEventListener("click", close);
  return { open, close };
}
