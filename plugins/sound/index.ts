// Sound (T§6): off by default, one button in the bottom-left control, synthesized sounds for
// page events, and the whale song for plan B.
//
//   click (gesture) -> AudioContext created -> on; the choice is remembered ("sound")
//   later visit, remembered on -> the first gesture creates / resumes the context
import type { PageEvents } from "../../platform/events.ts";
import type { Host } from "../../platform/host.ts";
import { h, icon } from "../../platform/ui/parts.ts";
import type { ContentApi } from "../content/api.ts";
import type { SoundApi, SoundName } from "./api.ts";
import { cueFor, gate, isOn, toStored } from "./cues.ts";
import { createEngine, type Engine } from "./engine.ts";
import "./style.css";

const EVENTS: (keyof PageEvents)[] = [
  "case-opened",
  "case-closed",
  "service-opened",
  "tile-hovered",
  "email-copied",
  "piece-grabbed",
  "piece-dropped",
  "wall-shuffled",
  "wall-tidied",
  "whale-launched",
  "whale-hit",
];
const SONG = "/media/whale-song.m4a";

export default function init(host: Host) {
  const w = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  let on = !!Ctor && isOn(host.memory.get("sound"));
  let engine: Engine | null = null;
  let audio: HTMLAudioElement | null = null;
  let warned = false;
  const open = gate();

  const api: SoundApi = {
    play(name: SoundName, pitch?: number) {
      if (!on || !engine || !open(name, performance.now())) return;
      engine.play(name, pitch);
    },
    song() {
      if (audio && !audio.paused) return stopSong();
      if (!on && Ctor) setOn(true);
      if (!audio) {
        audio = new Audio(SONG);
        audio.preload = "auto";
        audio.addEventListener("error", () => warn(audio?.error?.message || `cannot load ${SONG}`));
      }
      audio.currentTime = 0;
      audio.play().catch((e: Error) => warn(e.message));
    },
  };
  host.provide("sound", api);

  function warn(why: string) {
    if (warned) return;
    warned = true;
    console.warn(`The whale song did not play: ${why}`);
  }
  function stopSong() {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  for (const type of EVENTS)
    host.on(type, (detail) => {
      if (!on) return;
      let x = 0.5;
      if (type === "piece-grabbed") {
        const r = host.motion.el((detail as PageEvents["piece-grabbed"]).piece)?.getBoundingClientRect();
        if (r) x = Math.min(1, Math.max(0, (r.left + r.width / 2) / innerWidth));
      }
      const cue = cueFor(type, detail, x);
      if (cue) api.play(cue.name, cue.pitch);
    });

  // No Web Audio in this browser: no button, the page stays silent.
  if (!Ctor) return;

  const btn = h("button", { type: "button", class: "cbtn sound-btn" });
  const divider = h("span", { class: "divider", "aria-hidden": "true" });
  host.region("corner-left").prepend(btn, divider);
  // One name, the state in aria-pressed: "Site sound, toggle button, pressed".
  const show = () => {
    btn.setAttribute("aria-pressed", String(on));
    btn.replaceChildren(icon(on ? "soundOn" : "soundOff", 24));
    btn.setAttribute("aria-label", host.use<ContentApi>("content").text("sound.label"));
  };
  host.ready(show);
  host.on("language-changed", show);
  btn.addEventListener("click", () => setOn(!on));

  function setOn(next: boolean) {
    on = next;
    host.memory.set("sound", toStored(on));
    if (on) wake(true);
    else {
      stopSong();
      engine?.ctx.suspend().catch(() => {});
    }
    show();
  }

  // Runs inside a gesture: the browser lets audio start only then.
  function wake(fresh: boolean) {
    if (!engine) engine = createEngine(Ctor!);
    const ctx = engine.ctx;
    const go = () => fresh && engine!.play("on");
    if (ctx.state === "running") go();
    else ctx.resume().then(go, () => {});
  }
  const onGesture = () => on && (!engine || engine.ctx.state !== "running") && !document.hidden && wake(false);
  for (const type of ["pointerdown", "pointerup", "keydown", "touchend"]) window.addEventListener(type, onGesture, { capture: true, passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopSong();
    if (!engine) return;
    if (document.hidden) engine.ctx.suspend().catch(() => {});
    else if (on) engine.ctx.resume().catch(() => {});
  });
  window.addEventListener("pagehide", stopSong);
}
