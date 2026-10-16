// Builds site/media from the case sources and the team photos, then checks the size budget.
// Run: bun tools/media.ts [--src tmp/cases-src] [--only 3] [--team [--team-src tmp/team-src]]
// --team builds only the team badges. Settings per case and per team member live in tools/media.json.
// site/media/music.m4a is not built here (see docs/credits.md); the budget table only checks it.

import ffmpegPath from "ffmpeg-static";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import config from "./media.json";

const KB = 1000;
const MB = 1000 * KB;
const FULL_LIMIT = 20 * MB;

export interface Case {
  id: number;
  src: string;
  kind: "video" | "still";
  size: "xl" | "l" | "t";
  sound: boolean;
  poster: number | string; // the tile's still (also the phone tile and the open case): a second of the video, or a picture file next to the source
  ringStart: number; // the round badge's loop: start and length in seconds, at most 8
  ringLength: number;
  phoneFocus: [number, number]; // centre of the phone crop, 0..1
  ring: [number, number]; // close-up point of the round badge, 0..1
  crop?: [number, number, number, number]; // x, y, width, height (source pixels) to keep, e.g. without a screen recorder's tooltip
}

export interface TeamMedia {
  id: number;
  src: string;
  video?: boolean; // a short loop: team-N.mp4 plus its first frame as the poster team-N.webp
  crop?: [number, number, number]; // x, y and side (source pixels) of the square to cut from a wide photo
}

export const cases = config.cases as Case[];
export const team = config.team as TeamMedia[];
export const TEAM_SIZE = 320;
export const RING_SIZE = 320;
export const outDir = join(import.meta.dir, "..", "site", "media");
export const TOTAL_LIMIT = 80 * MB;
export const MUSIC = { file: "music.m4a", limit: 3.5 * MB };

/** Every file the pipeline writes for one case, with its size limit in bytes. */
export function outputs(c: Case): { file: string; limit: number }[] {
  const n = `c${c.id}`;
  const stills = [
    { file: `${n}.webp`, limit: 120 * KB },
    { file: `${n}-phone.webp`, limit: 120 * KB },
    { file: `${n}-ring.webp`, limit: 30 * KB },
  ];
  if (c.kind === "still") return [...stills, { file: `${n}-full.webp`, limit: 300 * KB }];
  return [...stills, { file: `${n}-ring.mp4`, limit: 600 * KB }, { file: `${n}-full.mp4`, limit: FULL_LIMIT }];
}

/** Every file the pipeline writes for one team member, with its size limit in bytes. */
export function teamOutputs(m: TeamMedia): { file: string; limit: number }[] {
  const out = [{ file: `team-${m.id}.webp`, limit: 40 * KB }];
  return m.video ? [...out, { file: `team-${m.id}.mp4`, limit: 250 * KB }] : out;
}

if (!ffmpegPath) throw new Error("ffmpeg-static has no binary for this platform");
const ffmpeg: string = ffmpegPath;

async function run(args: string[]): Promise<void> {
  const p = Bun.spawn([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", ...args], { stdout: "ignore", stderr: "pipe" });
  const err = await new Response(p.stderr).text();
  if ((await p.exited) !== 0) throw new Error(`ffmpeg ${args.join(" ")}\n${err}`);
}

export interface Info {
  duration: number; // 0 for a still image
  width: number; // width and height are 0 when there is no video stream
  height: number;
  fps: number;
  audio: boolean;
}

/** There is no ffprobe: `ffmpeg -i` prints the streams to stderr (and exits 1 for lack of an output file). */
export async function probe(file: string): Promise<Info> {
  const p = Bun.spawn([ffmpeg, "-hide_banner", "-i", file], { stdout: "ignore", stderr: "pipe" });
  const text = await new Response(p.stderr).text();
  await p.exited;
  const video = text.match(/Stream #\S+.*Video: .*/)?.[0] ?? "";
  const size = video.match(/, (\d+)x(\d+)/);
  const audio = /Stream #\S+.*Audio:/.test(text);
  if (!video && !audio) throw new Error(`cannot read ${file}\n${text}`);
  const time = text.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return {
    duration: time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : 0,
    width: Number(size?.[1] ?? 0),
    height: Number(size?.[2] ?? 0),
    fps: Number(video.match(/([\d.]+) fps/)?.[1] ?? 0),
    audio,
  };
}

// ---- geometry -------------------------------------------------------------

const even = (v: number) => Math.floor(v / 2) * 2;

/** Phone crop: 4:5, or 2:3 for the tall tile. Tall tiles use the same crop. */
const phoneAspect = (c: Case): [number, number] => (c.size === "t" ? [2, 3] : [4, 5]);
const phoneSize = (c: Case): [number, number] => (c.size === "t" ? [720, 1080] : [720, 900]);

/** Largest crop of the source with the given aspect, centred on the focus point and kept inside the frame. */
function cropBox(info: Info, [aw, ah]: [number, number], [fx, fy]: [number, number]) {
  let w = info.width;
  let h = info.height;
  if (w * ah > h * aw) w = even((h * aw) / ah);
  else h = even((w * ah) / aw);
  const x = even(Math.min(Math.max(fx * info.width - w / 2, 0), info.width - w));
  const y = even(Math.min(Math.max(fy * info.height - h / 2, 0), info.height - h));
  return { w, h, x, y };
}

function phoneCrop(c: Case, info: Info): string {
  const b = cropBox(info, phoneAspect(c), c.phoneFocus);
  return `crop=${b.w}:${b.h}:${b.x}:${b.y}`;
}

/** Round badge: a square around the ring point, a little under half of the short side. */
function ringCrop(c: Case, info: Info, size = RING_SIZE): string {
  const side = even(Math.min(info.width, info.height) * 0.45);
  const x = even(Math.min(Math.max(c.ring[0] * info.width - side / 2, 0), info.width - side));
  const y = even(Math.min(Math.max(c.ring[1] * info.height - side / 2, 0), info.height - side));
  return `crop=${side}:${side}:${x}:${y},${scaleTo(size, size)}`;
}

/** The case's own crop of the source, first in every filter, and the size it leaves. */
const keep = (c: Case) => (c.crop ? `crop=${c.crop[2]}:${c.crop[3]}:${c.crop[0]}:${c.crop[1]},` : "");
const kept = (c: Case, info: Info): Info => (c.crop ? { ...info, width: c.crop[2], height: c.crop[3] } : info);

// ---- encoders -------------------------------------------------------------

const h264 = ["-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "slow", "-movflags", "+faststart"];
const scaleTo = (w: number | string, h: number | string) => `scale=${w}:${h}:flags=lanczos`;
const cap30 = (info: Info) => (info.fps > 30 ? "fps=30," : "");

/** The round badge's silent loop: the chosen fragment, square, RING_SIZE. */
async function ringVideo(c: Case, src: string, info: Info, out: string) {
  const vf = `${cap30(info)}${keep(c)}${ringCrop(c, kept(c, info))}`;
  await run(["-ss", `${c.ringStart}`, "-i", src, "-t", `${Math.min(8, c.ringLength)}`, "-an", "-vf", vf,
    ...h264, "-crf", "26", "-maxrate", "600k", "-bufsize", "1200k", out]);
}

/** One frame as webp: at `at` seconds of a video, or the image itself (at null). */
async function frame(src: string, at: number | null, vf: string, quality: number, out: string) {
  const seek = at === null ? [] : ["-ss", `${at}`]; // -ss on a lone image drops its only frame
  await run([...seek, "-i", src, "-frames:v", "1", "-vf", vf,
    "-c:v", "libwebp", "-quality", `${quality}`, "-compression_level", "6", out]);
}

/**
 * Watch-it-all video: up to 1920 wide (720 wide for a vertical source), AAC when the source has sound.
 * CRF 23, with the bitrate capped at what the 20 MB limit leaves for this duration (a long clip at
 * plain CRF 23 can come out bigger than its source: case 3 gave 35 MB).
 */
async function fullVideo(c: Case, src: string, info: Info, out: string) {
  const vf = keep(c) + (info.height > info.width ? scaleTo(720, -2) : scaleTo("'min(1920,iw)'", -2));
  const audio = info.audio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : ["-an"];
  const maxKbps = Math.floor((FULL_LIMIT * 8 * 0.95) / info.duration / 1000) - (info.audio ? 128 : 0);
  await run(["-i", src, "-vf", vf, ...h264, "-crf", "23", "-maxrate", `${maxKbps}k`, "-bufsize", `${2 * maxKbps}k`, ...audio, out]);
}

/**
 * What the wall shows: the tile's still (the frame at `poster` seconds, or the picture `poster`
 * names), its phone crop, and the round badge, a loop of the chosen fragment with its first frame
 * as the still before it plays.
 */
export async function wallMedia(c: Case, src: string, info: Info, srcDir: string) {
  const n = `c${c.id}`;
  const k = kept(c, info);
  const [pw, ph] = phoneSize(c);
  const at = (t: number) => (c.kind === "video" ? t : null);
  const picture = typeof c.poster === "string" ? join(srcDir, c.poster) : null;
  const [still, stillAt, cut, size] = picture ? [picture, null, "", await probe(picture)] : [src, at(c.poster as number), keep(c), k];
  // A medium tile is 3 columns, about 500 px on a wide screen: 1024 covers it at 2x. The first
  // screen has a byte budget.
  const tile = c.size === "t" ? `${phoneCrop(c, size)},${scaleTo(720, 1080)}` : scaleTo(c.size === "l" ? 1024 : 1280, -2);
  await frame(still, stillAt, cut + tile, 62, join(outDir, `${n}.webp`));
  await frame(still, stillAt, `${cut}${phoneCrop(c, size)},${scaleTo(pw, ph)}`, 70, join(outDir, `${n}-phone.webp`));
  // The still is smaller than the loop: it is on the first screen, which has a byte budget.
  await frame(src, at(c.ringStart), keep(c) + ringCrop(c, k, 240), 60, join(outDir, `${n}-ring.webp`));
  if (c.kind === "video") await ringVideo(c, src, info, join(outDir, `${n}-ring.mp4`));
}

async function buildVideoCase(c: Case, src: string, info: Info, srcDir: string) {
  if (c.ringLength > 8) throw new Error(`case ${c.id}: ringLength ${c.ringLength} is over 8 s`);
  if (c.ringStart + c.ringLength > info.duration + 0.05) {
    throw new Error(`case ${c.id}: fragment ${c.ringStart}+${c.ringLength} s is longer than the source (${info.duration} s)`);
  }
  if (typeof c.poster === "number" && c.poster > info.duration) throw new Error(`case ${c.id}: poster ${c.poster} s is past the end (${info.duration} s)`);
  if (c.sound !== info.audio) throw new Error(`case ${c.id}: media.json sound=${c.sound} but the source ${info.audio ? "has" : "has no"} audio`);
  await wallMedia(c, src, info, srcDir);
  await fullVideo(c, src, info, join(outDir, `c${c.id}-full.mp4`));
}

async function buildStillCase(c: Case, src: string, info: Info, srcDir: string) {
  if (c.sound) throw new Error(`case ${c.id}: a still image has no sound`);
  await wallMedia(c, src, info, srcDir);
  await frame(src, null, keep(c) + scaleTo(1280, -2), 85, join(outDir, `c${c.id}-full.webp`));
}

// ---- team badges ----------------------------------------------------------

const teamScale = scaleTo(TEAM_SIZE, TEAM_SIZE);

/**
 * Square webp of a member (the poster for a video member: its first frame), plus for a video
 * member a silent loop. The source clip does not end where it starts (the head has moved), so the
 * loop plays forward and then back, without repeating the two end frames: no jump at the seam.
 */
async function buildTeamMember(m: TeamMedia, src: string) {
  const crop = m.crop ? `crop=${m.crop[2]}:${m.crop[2]}:${m.crop[0]}:${m.crop[1]},` : "";
  const webp = ["-frames:v", "1", "-c:v", "libwebp", "-quality", "80", "-compression_level", "6"];
  await run(["-i", src, "-vf", `${crop}${teamScale}`, ...webp, join(outDir, `team-${m.id}.webp`)]);
  if (!m.video) return;
  const info = await probe(src);
  const last = Math.round(info.duration * info.fps) - 1; // index of the last frame
  const graph = `[0:v]${teamScale},split[a][b];[b]reverse,trim=start_frame=1:end_frame=${last},setpts=PTS-STARTPTS[r];[a][r]concat=n=2:v=1:a=0[v]`;
  await run(["-i", src, "-filter_complex", graph, "-map", "[v]", "-an", ...h264, "-crf", "23", join(outDir, `team-${m.id}.mp4`)]);
}

// ---- budget table ---------------------------------------------------------

async function sizeOf(file: string): Promise<number | null> {
  return stat(file).then((s) => s.size, () => null);
}

async function directorySize(dir: string): Promise<number> {
  let total = 0;
  for (const name of await readdir(dir)) total += (await sizeOf(join(dir, name))) ?? 0;
  return total;
}

async function report(files: { file: string; limit: number }[]): Promise<boolean> {
  const rows: string[][] = [["file", "bytes", "limit", "status"]];
  let ok = true;
  for (const { file, limit } of files) {
    const bytes = await sizeOf(join(outDir, file));
    const state = bytes === null ? "MISSING" : bytes < KB ? "EMPTY" : bytes > limit ? "OVER" : "OK";
    if (state !== "OK") ok = false;
    rows.push([file, `${bytes ?? "-"}`, `${limit}`, state]);
  }
  const total = await directorySize(outDir);
  const totalState = total > TOTAL_LIMIT ? "OVER" : "OK";
  if (totalState !== "OK") ok = false;
  rows.push(["TOTAL site/media", `${total}`, `${TOTAL_LIMIT}`, totalState]);

  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(r.map((cell, i) => (i === 0 || i === 3 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  "));
  return ok;
}

// ---- main -----------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv[argv.indexOf(name) + 1];
  const srcDir = argv.includes("--src") ? resolve(flag("--src")) : join(import.meta.dir, "..", "tmp", "cases-src");
  const teamSrc = argv.includes("--team-src") ? resolve(flag("--team-src")) : join(import.meta.dir, "..", "tmp", "team-src");
  const teamOnly = argv.includes("--team");
  const only = argv.includes("--only") ? Number(flag("--only")) : null;
  const chosen = teamOnly ? [] : cases.filter((c) => only === null || c.id === only);
  if (!teamOnly && chosen.length === 0) throw new Error(`no case with id ${only}`);

  await mkdir(outDir, { recursive: true });
  const files: { file: string; limit: number }[] = [];
  for (const c of chosen) {
    const t0 = Date.now();
    const src = join(srcDir, c.src);
    const info = await probe(src);
    if (info.width === 0) throw new Error(`${src} has no video stream`);
    await (c.kind === "still" ? buildStillCase(c, src, info, srcDir) : buildVideoCase(c, src, info, srcDir));
    files.push(...outputs(c));
    console.log(`case ${c.id} done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  if (only === null) {
    for (const m of team) {
      await buildTeamMember(m, join(teamSrc, m.src));
      files.push(...teamOutputs(m));
    }
    console.log("team done");
  }
  if (only === null && !teamOnly) files.push(MUSIC);
  console.log();
  if (!(await report(files))) process.exit(1);
}

if (import.meta.main) await main();
