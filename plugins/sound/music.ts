// The music bed: one looping track behind the page while site sound is on.
//
//   music.m4a, decoded once -> looping buffer source -> lowpass -> music gain -> compressor (engine.out)
//
// A buffer source loops sample-exact; <audio loop> leaves about 20 ms of silence at every wrap.
// Start is a needle drop: the lowpass sits at 110 Hz for half a second, then opens to 20 kHz while the
// gain comes up. Stop is the reverse; after the fade the source stops. Web Audio puts nothing on a lock
// screen. The file is asked for on the first start, never before.
export const MUSIC_SRC = "/media/music.m4a";
export const LEVEL = 0.44;
const DULL = 110; // Hz, the lowpass shut
const OPEN = 20000; // Hz, the lowpass open
const FADE_MS = 1550; // the gain is at 0 after 1.5 s

// The fades, apart from the nodes so a test can read them. Both start from where the params are now,
// so a start during a stop (and the other way round) has no jump.
export function needleDrop(lp: AudioParam, gain: AudioParam, t: number) {
  const f = lp.value;
  const g = gain.value;
  lp.cancelScheduledValues(t);
  lp.setValueAtTime(f, t);
  lp.exponentialRampToValueAtTime(DULL, t + 0.05);
  lp.setValueAtTime(DULL, t + 0.5);
  lp.exponentialRampToValueAtTime(OPEN, t + 3.7);
  gain.cancelScheduledValues(t);
  gain.setValueAtTime(g, t);
  gain.linearRampToValueAtTime(LEVEL, t + 0.9);
}
export function fadeOut(lp: AudioParam, gain: AudioParam, t: number) {
  const f = lp.value;
  const g = gain.value;
  lp.cancelScheduledValues(t);
  lp.setValueAtTime(f, t);
  lp.exponentialRampToValueAtTime(DULL, t + 1.3);
  gain.cancelScheduledValues(t);
  gain.setValueAtTime(g, t);
  gain.linearRampToValueAtTime(0, t + 1.5);
}

// warn: one line for a file that cannot play. idle: the music is fully stopped (or was not playing).
export function createMusic(ctx: AudioContext, out: AudioNode, warn: (why: string) => void, idle: () => void) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = DULL;
  lp.Q.value = 0.7;
  const level = ctx.createGain();
  level.gain.value = 0;
  lp.connect(level).connect(out);

  let state: "idle" | "loading" | "playing" | "fading" = "idle";
  let track: Promise<AudioBuffer> | null = null;
  let source: AudioBufferSourceNode | null = null;
  let failed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Stops the source and puts the nodes back where the next needle drop starts.
  function release() {
    clearTimeout(timer);
    state = "idle";
    source?.stop();
    source?.disconnect();
    source = null;
    lp.frequency.cancelScheduledValues(0);
    lp.frequency.value = DULL;
    level.gain.cancelScheduledValues(0);
    level.gain.value = 0;
    idle();
  }
  function play(buffer: AudioBuffer) {
    if (state !== "loading") return; // stopped while the file loaded
    state = "playing";
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(lp);
    needleDrop(lp.frequency, level.gain, ctx.currentTime);
    source.start();
  }
  function problem(e: Error) {
    failed = true; // a file that cannot be read is not asked for again until the visitor turns sound on again
    track = null;
    warn(e.message);
    if (state !== "idle") release();
  }

  return {
    get state() {
      return state;
    },
    start() {
      if (state === "playing" || state === "loading" || failed) return;
      clearTimeout(timer);
      if (source) {
        // Back during the fade: the same source goes on.
        state = "playing";
        needleDrop(lp.frequency, level.gain, ctx.currentTime);
        return;
      }
      state = "loading";
      track ??= fetch(MUSIC_SRC)
        .then((r) => {
          if (!r.ok) throw new Error(`cannot load ${MUSIC_SRC}: HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data));
      track.then(play, problem);
    },
    stop() {
      if (state === "idle") return idle();
      if (state === "loading") return release();
      if (state === "fading") return;
      state = "fading";
      fadeOut(lp.frequency, level.gain, ctx.currentTime);
      timer = setTimeout(release, FADE_MS);
    },
    // The page is going away: no fade.
    halt() {
      if (state !== "idle") release();
    },
    reset() {
      failed = false;
    },
  };
}

export type Music = ReturnType<typeof createMusic>;
