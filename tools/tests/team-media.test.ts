// Checks the committed output of `bun tools/media.ts --team`: the badge pictures and Maria's loop.
// Run the pipeline first if a file is missing (sources: tmp/team-src).

import { describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { outDir, probe, team, TEAM_SIZE, teamOutputs } from "../media.ts";

const path = (file: string) => join(outDir, file);

describe("team media", () => {
  test("four members; only Maria has a video", () => {
    expect(team.map((m) => m.id)).toEqual([1, 2, 3, 4]);
    expect(team.filter((m) => m.video).map((m) => m.id)).toEqual([3]);
  });

  for (const m of team) {
    test(`member ${m.id}: files exist within their limits, ${TEAM_SIZE}x${TEAM_SIZE}, no audio`, async () => {
      for (const { file, limit } of teamOutputs(m)) {
        const bytes = await stat(path(file)).then((s) => s.size, () => {
          throw new Error(`${file} is missing: run bun tools/media.ts --team`);
        });
        expect(bytes, `${file} is empty`).toBeGreaterThan(1000);
        expect(bytes, `${file} is over ${limit} bytes`).toBeLessThanOrEqual(limit);
        const info = await probe(path(file));
        expect([info.width, info.height], file).toEqual([TEAM_SIZE, TEAM_SIZE]);
        expect(info.audio, `${file} has audio`).toBe(false);
      }
    });
  }

  test("Maria's loop is short, 30 fps at most, and laid out for streaming", async () => {
    const info = await probe(path("team-3.mp4"));
    expect(info.duration).toBeGreaterThan(1);
    expect(info.duration).toBeLessThanOrEqual(4);
    expect(info.fps).toBeLessThanOrEqual(30);
    const head = Buffer.from(await Bun.file(path("team-3.mp4")).slice(0, 64 * 1024).arrayBuffer());
    const moov = head.indexOf("moov");
    expect(moov, "no moov in the first 64 KB").toBeGreaterThan(-1);
    const mdat = head.indexOf("mdat");
    if (mdat !== -1) expect(moov).toBeLessThan(mdat);
  });
});
