// Checks the committed output of `bun tools/media.ts`: files exist, fit their size limits, have the
// right streams and are laid out for streaming. Run the pipeline first if a file is missing.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cases, outDir, outputs, probe, TOTAL_LIMIT } from "../media.ts";
import { readdir, stat } from "node:fs/promises";

const path = (file: string) => join(outDir, file);

async function size(file: string): Promise<number> {
  return stat(path(file)).then((s) => s.size, () => {
    throw new Error(`${file} is missing: run bun tools/media.ts`);
  });
}

describe("media files", () => {
  for (const c of cases) {
    test(`case ${c.id}: every file exists and is within its limit`, async () => {
      for (const { file, limit } of outputs(c)) {
        const bytes = await size(file);
        expect(bytes, `${file} is empty`).toBeGreaterThan(1000);
        expect(bytes, `${file} is over ${limit} bytes`).toBeLessThanOrEqual(limit);
      }
    });
  }

  test("no round badge and no music is left", async () => {
    expect((await readdir(outDir)).filter((f) => /-ring\.(mp4|webp)$|^music\./.test(f))).toEqual([]);
  });

  test("site/media is within the total budget", async () => {
    let total = 0;
    for (const name of await readdir(outDir)) total += await size(name);
    expect(total).toBeLessThanOrEqual(TOTAL_LIMIT);
  });
});

describe("streams", () => {
  for (const c of cases.filter((c) => c.kind === "video")) {
    test(`case ${c.id}: full video ${c.sound ? "has" : "has no"} audio`, async () => {
      const info = await probe(path(`c${c.id}-full.mp4`));
      expect(info.audio).toBe(c.sound);
    });
  }

  for (const c of cases.filter((c) => c.kind === "video")) {
    test(`case ${c.id}: both loops are silent, at most 8 s and 30 fps; the phone loop is ${c.size === "t" ? "720x1080" : "720x900"}`, async () => {
      const tile = await probe(path(`c${c.id}-loop.mp4`));
      const phone = await probe(path(`c${c.id}-loop-phone.mp4`));
      for (const info of [tile, phone]) {
        expect(info.audio).toBe(false);
        expect(info.duration).toBeLessThanOrEqual(8.05);
        expect(info.fps).toBeLessThanOrEqual(30);
      }
      expect([phone.width, phone.height]).toEqual(c.size === "t" ? [720, 1080] : [720, 900]);
    });

    // A picture poster has its own aspect; a frame of the video has the loop's.
    test(`case ${c.id}: the tile loop is as wide as the tile's still${typeof c.poster === "number" ? " and as high" : ""}`, async () => {
      const still = await probe(path(`c${c.id}.webp`));
      const tile = await probe(path(`c${c.id}-loop.mp4`));
      expect(tile.width).toBe(still.width);
      if (typeof c.poster === "number") expect(Math.abs(tile.height - still.height)).toBeLessThanOrEqual(2);
    });
  }

  test("every video case names its loop: loopStart from 0, loopLength up to 8 s", () => {
    for (const c of cases.filter((c) => c.kind === "video")) {
      expect(c.loopStart, `case ${c.id}`).toBeGreaterThanOrEqual(0);
      expect(c.loopLength, `case ${c.id}`).toBeGreaterThan(0);
      expect(c.loopLength, `case ${c.id}`).toBeLessThanOrEqual(8);
    }
  });

  test("cases 8 and 10 are gone", async () => {
    expect(cases.filter((c) => c.id === 8 || c.id === 10)).toEqual([]);
    expect((await readdir(outDir)).filter((f) => /^c(8|10)[-.]/.test(f))).toEqual([]);
  });

  test("no file of the old wall loops is left", async () => {
    expect((await readdir(outDir)).filter((f) => /^c\d+-(tile|phone)\.mp4$/.test(f))).toEqual([]);
  });
});

describe("faststart", () => {
  const files = [
    ...cases.flatMap((c) => (c.kind === "video" ? [`c${c.id}-full.mp4`] : [])),
    ...cases.flatMap((c) => (c.kind === "video" ? [`c${c.id}-loop.mp4`, `c${c.id}-loop-phone.mp4`] : [])),
  ];
  for (const file of files) {
    test(`${file}: moov comes before mdat`, async () => {
      const head = Buffer.from(await Bun.file(path(file)).slice(0, 64 * 1024).arrayBuffer());
      const moov = head.indexOf("moov");
      const mdat = head.indexOf("mdat");
      expect(moov, "no moov in the first 64 KB").toBeGreaterThan(-1);
      // a large moov can push mdat past the first 64 KB; then it is not in the buffer at all
      if (mdat !== -1) expect(moov).toBeLessThan(mdat);
    });
  }
});
