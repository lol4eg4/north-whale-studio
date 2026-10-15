// Checks the committed output of `bun tools/media.ts`: files exist, fit their size limits, have the
// right streams and are laid out for streaming. Run the pipeline first if a file is missing.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cases, outDir, MUSIC, outputs, probe, RING_SIZE, TOTAL_LIMIT } from "../media.ts";
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

  test("music exists, is within its limit and is an audio-only loop of 30-120 s", async () => {
    const bytes = await size(MUSIC.file);
    expect(bytes).toBeGreaterThan(1000);
    expect(bytes).toBeLessThanOrEqual(MUSIC.limit);
    const info = await probe(path(MUSIC.file));
    expect(info.duration).toBeGreaterThanOrEqual(30);
    expect(info.duration).toBeLessThanOrEqual(120);
    expect(info.audio).toBe(true);
    expect(info.width).toBe(0);
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
    test(`case ${c.id}: the round badge's loop is ${RING_SIZE} square, silent, at most 8 s and 30 fps`, async () => {
      const info = await probe(path(`c${c.id}-ring.mp4`));
      expect([info.width, info.height]).toEqual([RING_SIZE, RING_SIZE]);
      expect(info.audio).toBe(false);
      expect(info.duration).toBeLessThanOrEqual(8.05);
      expect(info.fps).toBeLessThanOrEqual(30);
    });
  }

  test("the vertical case 8 is 720x1080 as a tile and 720x1280 in full", async () => {
    const tile = await probe(path("c8.webp"));
    expect([tile.width, tile.height]).toEqual([720, 1080]);
    const full = await probe(path("c8-full.mp4"));
    expect([full.width, full.height]).toEqual([720, 1280]);
  });

  test("no file of the old wall loops is left", async () => {
    expect((await readdir(outDir)).filter((f) => /^c\d+-(tile|phone)\.mp4$/.test(f))).toEqual([]);
  });
});

describe("faststart", () => {
  const files = [
    ...cases.flatMap((c) => (c.kind === "video" ? [`c${c.id}-full.mp4`] : [])),
    ...cases.flatMap((c) => (c.kind === "video" ? [`c${c.id}-ring.mp4`] : [])),
    MUSIC.file,
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
