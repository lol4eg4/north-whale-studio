import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMusic, fadeOut, LEVEL, MUSIC_SRC, needleDrop } from "../music.ts";

// An AudioParam that writes down what is scheduled on it.
class Param {
  calls: (string | number)[][] = [];
  constructor(public value: number) {}
  cancelScheduledValues(t: number) {
    this.calls.push(["cancel", t]);
  }
  setValueAtTime(v: number, t: number) {
    this.calls.push(["set", v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(["linear", v, t]);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.calls.push(["exp", v, t]);
  }
}

describe("music fades", () => {
  test("needle drop: lowpass held at 110 Hz for 0.5 s, then opens to 20 kHz by +3.7 s; gain 0 to 0.44 over 0.9 s", () => {
    const lp = new Param(110);
    const gain = new Param(0);
    needleDrop(lp as unknown as AudioParam, gain as unknown as AudioParam, 10);
    expect(lp.calls).toEqual([
      ["cancel", 10],
      ["set", 110, 10],
      ["exp", 110, 10.05],
      ["set", 110, 10.5],
      ["exp", 20000, 13.7],
    ]);
    expect(gain.calls).toEqual([
      ["cancel", 10],
      ["set", 0, 10],
      ["linear", LEVEL, 10.9],
    ]);
    expect(LEVEL).toBe(0.44);
  });

  test("fade out: lowpass back to 110 Hz over 1.3 s, gain to 0 over 1.5 s, from where they are", () => {
    const lp = new Param(8000);
    const gain = new Param(0.3);
    fadeOut(lp as unknown as AudioParam, gain as unknown as AudioParam, 5);
    expect(lp.calls).toEqual([
      ["cancel", 5],
      ["set", 8000, 5],
      ["exp", 110, 6.3],
    ]);
    expect(gain.calls).toEqual([
      ["cancel", 5],
      ["set", 0.3, 5],
      ["linear", 0, 6.5],
    ]);
  });

  test("a start during a fade-out goes on from the current values, with no jump", () => {
    const lp = new Param(2000);
    const gain = new Param(0.2);
    needleDrop(lp as unknown as AudioParam, gain as unknown as AudioParam, 1);
    expect(lp.calls[1]).toEqual(["set", 2000, 1]);
    expect(gain.calls[1]).toEqual(["set", 0.2, 1]);
  });
});

// The context, fetch and timers, replaced so the state machine runs without a browser.
class FakeSource {
  buffer: unknown = null;
  loop = false;
  started = 0;
  stopped = 0;
  disconnected = 0;
  connect(n: unknown) {
    return n;
  }
  disconnect() {
    this.disconnected++;
  }
  start() {
    this.started++;
  }
  stop() {
    this.stopped++;
  }
}

describe("music source", () => {
  const real = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  let fetches: string[];
  let status: number;
  let offline: boolean;
  let corrupt: boolean;
  let sources: FakeSource[];
  let timers: { fn: () => void; ms: number }[];
  let warnings: string[];
  let idles: number;
  const TRACK = { duration: 30.72 };
  const flush = () => Bun.sleep(0);

  beforeEach(() => {
    fetches = [];
    status = 200;
    offline = false;
    corrupt = false;
    sources = [];
    timers = [];
    warnings = [];
    idles = 0;
    globalThis.fetch = (async (url: string) => {
      fetches.push(url);
      if (offline) throw new TypeError("Failed to fetch");
      return { ok: status === 200, status, arrayBuffer: async () => new ArrayBuffer(8) };
    }) as unknown as typeof fetch;
    globalThis.setTimeout = ((fn: () => void, ms: number) => timers.push({ fn, ms })) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((id: number) => {
      if (id) timers[id - 1] = { fn: () => {}, ms: 0 };
    }) as unknown as typeof clearTimeout;
  });
  afterEach(() => {
    globalThis.fetch = real.fetch;
    globalThis.setTimeout = real.setTimeout;
    globalThis.clearTimeout = real.clearTimeout;
  });

  function make() {
    const lp = { type: "", frequency: new Param(0), Q: { value: 0 }, connect: (n: unknown) => n };
    const gain = { gain: new Param(1), connect: (n: unknown) => n };
    const ctx = {
      currentTime: 2,
      createBiquadFilter: () => lp,
      createGain: () => gain,
      createBufferSource: () => sources[sources.push(new FakeSource()) - 1],
      decodeAudioData: async () => {
        if (corrupt) throw new DOMException("Unable to decode audio data", "EncodingError");
        return TRACK;
      },
    };
    const music = createMusic(ctx as unknown as AudioContext, {} as AudioNode, (why) => warnings.push(why), () => idles++);
    return { music, lp, gain };
  }

  test("nothing is asked for before the first start", () => {
    const { music, lp, gain } = make();
    expect(fetches).toEqual([]);
    expect(sources).toEqual([]);
    expect(lp.type).toBe("lowpass");
    expect(lp.frequency.value).toBe(110);
    expect(gain.gain.value).toBe(0);
    expect(music.state).toBe("idle");
  });

  test("start loads and decodes the file, then loops it with a needle drop; a second start does nothing", async () => {
    const { music, lp } = make();
    music.start();
    expect(music.state).toBe("loading");
    music.start();
    await flush();
    expect(fetches).toEqual([MUSIC_SRC]);
    expect(music.state).toBe("playing");
    expect(sources.length).toBe(1);
    expect(sources[0]).toMatchObject({ buffer: TRACK, loop: true, started: 1, stopped: 0 });
    expect(lp.frequency.calls.at(-1)).toEqual(["exp", 20000, 5.7]);
    music.start();
    await flush();
    expect(sources.length).toBe(1);
  });

  test("stop fades first, then stops the source; the next start reuses the decoded file", async () => {
    const { music } = make();
    music.start();
    await flush();
    music.stop();
    expect(music.state).toBe("fading");
    expect(sources[0].stopped).toBe(0);
    expect(timers.at(-1)!.ms).toBeGreaterThanOrEqual(1500);
    timers.at(-1)!.fn();
    expect(music.state).toBe("idle");
    expect(sources[0]).toMatchObject({ stopped: 1, disconnected: 1 });
    expect(idles).toBe(1);
    music.start();
    await flush();
    expect(music.state).toBe("playing");
    expect(sources.length).toBe(2);
    expect(fetches.length).toBe(1);
  });

  test("a start during the fade keeps the source and cancels the stop", async () => {
    const { music } = make();
    music.start();
    await flush();
    music.stop();
    const release = timers.length;
    music.start();
    expect(music.state).toBe("playing");
    timers[release - 1].fn(); // the cancelled stop does nothing
    expect(sources.length).toBe(1);
    expect(sources[0].stopped).toBe(0);
  });

  test("stop with nothing playing only reports idle", () => {
    const { music } = make();
    music.stop();
    expect(idles).toBe(1);
    expect(timers.length).toBe(0);
  });

  test("a stop while the file loads: nothing plays when it arrives", async () => {
    const { music } = make();
    music.start();
    music.stop();
    expect(music.state).toBe("idle");
    await flush();
    expect(sources).toEqual([]);
    expect(idles).toBe(1);
  });

  test("a file that fails warns once and is not asked for again until reset", async () => {
    status = 404;
    const { music } = make();
    music.start();
    await flush();
    expect(warnings).toEqual([`cannot load ${MUSIC_SRC}: HTTP 404`]);
    expect(music.state).toBe("idle");
    expect(sources).toEqual([]);
    music.start();
    await flush();
    expect(fetches.length).toBe(1); // not again
    status = 200;
    music.reset();
    music.start();
    await flush();
    expect(fetches.length).toBe(2);
    expect(music.state).toBe("playing");
  });

  test("halt stops the source at once and puts the nodes back for a clean next needle drop", async () => {
    const { music, lp, gain } = make();
    music.start();
    await flush();
    music.halt();
    expect(sources[0].stopped).toBe(1);
    expect(music.state).toBe("idle");
    expect(lp.frequency.value).toBe(110);
    expect(gain.gain.value).toBe(0);
    lp.frequency.calls.length = 0;
    gain.gain.calls.length = 0;
    music.start();
    await flush();
    expect(lp.frequency.calls[1]).toEqual(["set", 110, 2]);
    expect(gain.gain.calls[1]).toEqual(["set", 0, 2]);
  });

  test("start, stop, start again while the file loads: one source", async () => {
    const { music } = make();
    music.start();
    music.stop();
    music.start();
    await flush();
    expect(sources.length).toBe(1);
    expect(music.state).toBe("playing");
    expect(fetches.length).toBe(1);
  });

  for (const [what, set] of [
    ["no network", () => (offline = true)],
    ["a file that does not decode", () => (corrupt = true)],
  ] as const)
    test(`${what}: one warning, no source, no new request until reset`, async () => {
      set();
      const { music } = make();
      music.start();
      music.stop();
      music.start(); // two handlers wait on the one request
      await flush();
      expect(warnings.length).toBe(1);
      expect(sources).toEqual([]);
      expect(music.state).toBe("idle");
      music.start();
      await flush();
      expect(fetches.length).toBe(1);
    });
});
