// Roll call (T§4.10): the team block and every name badge jump to the top of the wall, the
// page glides there, the rest of the wall dims and each badge hops in turn. No popup.
import type { Motion } from "../../platform/motion.ts";

const afterScroll = () =>
  new Promise<void>((done) => {
    let last = scrollY;
    let still = 0;
    let frames = 0;
    const tick = () => {
      if (Math.abs(scrollY - last) < 1) still++;
      else (still = 0), (last = scrollY);
      if (still > 6 || ++frames > 150) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

export function createRollCall(motion: Motion, wall: HTMLElement, teamCell: HTMLElement, tagCells: HTMLElement[]) {
  let run = 0;
  let endTimer = 0;
  const end = () => {
    clearTimeout(endTimer);
    wall.classList.remove("rollcall");
    removeEventListener("pointerdown", end, true);
  };

  return async function rollCall() {
    const mine = ++run;
    end();
    const front = [teamCell, ...tagCells];
    void motion.reorder("wall", (cells) => [...front, ...cells.filter((c) => !front.includes(c))], false);
    // From layout, not the drawn box: the FLIP still shows the block at its old place.
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const top = wall.getBoundingClientRect().top + scrollY + teamCell.offsetTop - wall.offsetTop - pad;
    scrollTo({ top: Math.max(0, top), behavior: motion.calm ? "instant" : "smooth" });
    await afterScroll();
    if (mine !== run) return;
    wall.classList.add("rollcall");
    if (!motion.calm) {
      tagCells.forEach((cell, i) =>
        (cell.firstElementChild as HTMLElement | null)?.animate(
          [
            { transform: "none" },
            { transform: "translateY(-16%) rotate(-5deg) scale(1.1)", offset: 0.3 },
            { transform: "translateY(2%) rotate(3deg) scale(.97)", offset: 0.6 },
            { transform: "none" },
          ],
          { duration: 700, delay: 150 + i * 130, easing: "cubic-bezier(.3,.7,.3,1)" },
        ),
      );
    }
    addEventListener("pointerdown", end, true);
    endTimer = window.setTimeout(end, motion.calm ? 2200 : 3200);
  };
}
