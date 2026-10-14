// The open case's own player.
//   silent video: autoplays muted and looped (not in calm or paused), play/pause, seek, time, full screen
//   video with sound: poster + «Смотреть со звуком»; that click starts it with sound, then the same
//     controls plus a mute toggle
//   still picture (UNIUN): no player
//   error: poster + «Повторить», which reloads the source
import type { Motion } from "../../platform/motion.ts";
import { h, icon } from "../../platform/ui/parts.ts";
import type { CaseItem } from "../content/api.ts";

type Mode = "still" | "silent" | "sound";

const clock = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

export function createPlayer(text: (key: string) => string, motion: Motion) {
  const video = h("video", { class: "case-video", playsinline: true, preload: "metadata", disablepictureinpicture: true, controlslist: "nodownload noplaybackrate" });
  const picture = h("img", { class: "case-pic", alt: "", draggable: "false" });
  const errText = h("span");
  const retry = h("button", { type: "button", class: "btn case-retry" }, icon("retry", 18), h("span"));
  const errBox = h("div", { class: "case-err", role: "alert" }, errText, retry);
  const frame = h("div", { class: "case-frame" }, picture, video, errBox);

  const goIcon = h("span", { class: "go-ico" });
  const goText = h("span");
  const go = h("button", { type: "button", class: "go" }, goIcon, goText);
  const seek = h("input", { type: "range", class: "seek", min: "0", max: "1000", step: "1", value: "0" });
  const time = h("span", { class: "time mono" }, "0:00 / 0:00");
  const mute = h("button", { type: "button", class: "case-round mute" });
  const full = h("button", { type: "button", class: "case-round full" }, icon("fullscreen", 18));
  const bar = h("div", { class: "player" }, go, seek, time, mute, full);
  const el = h("div", { class: "case-art" }, frame, bar);

  let item: CaseItem | null = null;
  let mode: Mode = "still";
  let started = false; // sound videos start only on the visitor's click
  let failed = false;

  const render = () => {
    el.classList.toggle("still", mode === "still");
    el.classList.toggle("err", failed);
    bar.hidden = mode === "still";
    const waiting = mode === "sound" && !started;
    const playing = !video.paused && !video.ended && !waiting;
    goIcon.replaceChildren(icon(playing ? "pause" : "play", 14));
    goText.textContent = text(waiting ? "case.watchSound" : playing ? "case.pause" : "case.play");
    go.classList.toggle("wait", waiting);
    mute.hidden = !(mode === "sound" && started);
    mute.replaceChildren(icon(video.muted ? "muted" : "soundOn", 20));
    mute.setAttribute("aria-label", text(video.muted ? "case.unmute" : "case.mute"));
    full.setAttribute("aria-label", text("case.fullscreen"));
    seek.setAttribute("aria-label", text("case.seek"));
    errText.textContent = text("case.error");
    retry.lastElementChild!.textContent = text("case.retry");
  };
  const tick = () => {
    const d = video.duration;
    const p = d > 0 ? video.currentTime / d : 0;
    seek.value = String(Math.round(p * 1000));
    seek.style.setProperty("--p", `${(p * 100).toFixed(2)}%`);
    seek.setAttribute("aria-valuetext", clock(video.currentTime));
    time.textContent = `${clock(video.currentTime)} / ${clock(d)}`;
  };
  const play = () => {
    video.play().then(render, () => render()); // refused: the poster and the play button stay
  };
  const autoplay = () => mode === "silent" && !motion.calm && !motion.paused && !document.hidden;

  const load = () => {
    if (!item?.media.full) return;
    failed = false;
    video.src = item.media.full;
    video.load();
    if (autoplay() || (mode === "sound" && started)) play();
    render();
  };

  go.addEventListener("click", () => {
    if (mode === "sound" && !started) {
      started = true;
      video.muted = false;
      play();
    } else if (video.paused || video.ended) play();
    else video.pause();
    render();
  });
  mute.addEventListener("click", () => {
    video.muted = !video.muted;
    render();
  });
  seek.addEventListener("input", () => {
    if (video.duration > 0) video.currentTime = (Number(seek.value) / 1000) * video.duration;
    tick();
  });
  full.addEventListener("click", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (frame.requestFullscreen) frame.requestFullscreen().catch(() => {});
    else (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
  });
  // In full screen our bar is outside the frame, so the browser's own controls stand in.
  document.addEventListener("fullscreenchange", () => (video.controls = document.fullscreenElement === frame));
  retry.addEventListener("click", load);

  for (const type of ["play", "pause", "ended", "playing"]) video.addEventListener(type, render);
  for (const type of ["timeupdate", "loadedmetadata", "durationchange", "seeked"]) video.addEventListener(type, tick);
  video.addEventListener("loadeddata", () => {
    if (!failed) return;
    failed = false;
    render();
  });
  video.addEventListener("error", () => {
    if (!video.getAttribute("src")) return;
    failed = true;
    render();
  });
  document.addEventListener("visibilitychange", () => document.hidden && video.pause());
  // Pause stops case loops too; un-pausing leaves them for the visitor to start.
  motion.onChange(() => motion.paused && mode === "silent" && video.pause());

  return {
    el,
    show(c: CaseItem) {
      this.stop();
      item = c;
      started = false;
      failed = false;
      mode = c.kind === "still" || !c.media.full ? "still" : c.sound ? "sound" : "silent";
      el.classList.toggle("tall", c.vertical);
      picture.src = mode === "still" ? c.media.still ?? c.media.poster : c.media.poster;
      if (mode !== "still") {
        video.poster = c.media.poster;
        video.muted = mode === "silent";
        video.loop = mode === "silent";
        load();
      }
      tick();
      render();
    },
    stop() {
      if (document.fullscreenElement === frame) void document.exitFullscreen();
      video.pause();
      video.removeAttribute("src");
      video.removeAttribute("poster");
      video.load();
      item = null;
    },
    render,
  };
}
