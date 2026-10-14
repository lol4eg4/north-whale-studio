// Synthesized sounds (T§6.2-6.4): no samples, everything built from oscillators and noise.
//
//   notes (marimba, wood, piano) -> notes .5 --\
//   effects (noise, sweeps)      -> fx 2.2  ---> room: highpass, soft clip, lowpass -> master -> compressor -> out
//                                               room -> reverb send .3 -> convolver 2.4 s -> master
import type { SoundName } from "./api.ts";
import { hz } from "./cues.ts";

export type Engine = ReturnType<typeof createEngine>;

export function createEngine(Ctor: typeof AudioContext) {
  const ctx = new Ctor();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(ctx.destination);
  const master = gain(1);
  master.connect(comp);

  // The "speaker in a room" colour every sound goes through.
  const hp = filter("highpass", 75, 0.7);
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(2.2 * ((i / 1023) * 2 - 1)) / 2.2;
  shaper.curve = curve;
  shaper.oversample = "2x";
  const lp = filter("lowpass", 4300, 0.54);
  const room = gain(1.1);
  hp.connect(shaper).connect(lp).connect(room).connect(master);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(2.4, 3.2);
  room.connect(gain(0.3)).connect(verb).connect(master);
  const notes = gain(0.5);
  const fx = gain(2.2);
  notes.connect(hp);
  fx.connect(hp);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  function gain(v: number) {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  }
  function filter(type: BiquadFilterType, f: number, q: number) {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  function impulse(seconds: number, decay: number) {
    const len = Math.round(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }
  // Exponential attack and decay on a gain.
  function env(g: AudioParam, t: number, peak: number, att: number, dec: number) {
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + att);
    g.exponentialRampToValueAtTime(0.0001, t + att + dec);
  }
  function osc(type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode, peak: number, att: number, fTo?: number, glide = dur) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (fTo) o.frequency.exponentialRampToValueAtTime(fTo, t + glide);
    const g = ctx.createGain();
    env(g.gain, t, peak, att, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + att + dur + 0.05);
    return o;
  }
  function noise(t: number, dur: number, type: BiquadFilterType, f: number, q: number, peak: number, att: number, fTo?: number, glide = dur) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const b = filter(type, f, q);
    b.frequency.setValueAtTime(f, t);
    if (fTo) b.frequency.exponentialRampToValueAtTime(fTo, t + glide);
    const g = ctx.createGain();
    env(g.gain, t, peak, att, dur);
    src.connect(b).connect(g).connect(fx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + att + dur + 0.05);
  }
  // FM wobble on an oscillator's pitch (twang, boing).
  function wobble(o: OscillatorNode, t: number, rate: number, depth: number, dur: number) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const d = ctx.createGain();
    d.gain.setValueAtTime(depth, t);
    d.gain.exponentialRampToValueAtTime(1, t + dur);
    lfo.connect(d).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  // Instruments
  function marimba(step: number, t: number, v: number) {
    const f = hz(step);
    const vel = v * 0.7;
    osc("sine", f, t, 0.9, notes, 0.55 * vel, 0.003);
    osc("sine", f * 3.93, t, 0.12, notes, 0.16 * vel, 0.002);
    osc("sine", f * 9.2, t, 0.03, notes, 0.05 * vel, 0.001);
  }
  function wood(f: number, t: number, v: number) {
    osc("sine", 2 * f, t, 0.14, notes, 0.5 * v, 0.001, 1.9 * f, 0.08);
    osc("triangle", 5.1 * f, t, 0.05, notes, 0.12 * v, 0.001);
    noise(t, 0.035, "bandpass", Math.min(4 * f, 6000), 7, 0.22 * v, 0.001);
  }
  function piano(f: number, t: number, v: number) {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.42 * v, t + 0.005);
    out.gain.exponentialRampToValueAtTime(0.14 * v, t + 0.3);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    const b = filter("lowpass", Math.min(7 * f, 9000), 0.7);
    b.frequency.exponentialRampToValueAtTime(Math.max(1.4 * f, 400), t + 1.4);
    b.connect(out).connect(notes);
    const partials: [number, OscillatorType, number, number][] = [
      [1, "triangle", 1, 0],
      [1, "sine", 0.6, 4],
      [2, "sine", 0.3, -3],
      [3, "sine", 0.1, 5],
      [4, "sine", 0.05, -6],
    ];
    for (const [m, type, amp, cents] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * m;
      o.detune.value = cents;
      const g = gain(amp);
      o.connect(g).connect(b);
      o.start(t);
      o.stop(t + 2.7);
    }
  }

  const GUT = 0.45; // the dive's shuffle and chime sit 7 dB under the rest
  const effects: Record<SoundName | "on", (t: number, p: number) => void> = {
    click(t, p) {
      const k = p || 1;
      osc("sine", 1900 * k, t, 0.03, fx, 0.22 * k, 0.001, 1100 * k);
      noise(t, 0.012, "highpass", 4500, 0.7, 0.07 * k, 0.001);
    },
    tick(t) {
      noise(t, 0.06, "bandpass", 650, 1.4, 0.063, 0.014, 1500, 0.07);
      osc("sine", hz(0), t + 0.004, 0.06, notes, 0.0315, 0.002);
    },
    pop(t) {
      marimba(5, t, 0.5);
      marimba(8, t + 0.07, 0.5);
      noise(t, 0.17, "bandpass", 900, 0.6, 0.05, 0.08, 3500, 0.25);
    },
    peel(t, p) {
      // Glue letting go: micro-ticks that speed up, then a little rising tone.
      let at = t;
      for (let k = 0; k < 11; k++) {
        noise(at, 0.004, "highpass", 2400 + k * 120, 0.8, 0.035 + (k / 10) * 0.04, 0.001);
        at += 0.017 * 0.86 ** k;
      }
      const f = hz(2 + Math.round(p * 10));
      osc("sine", 0.84 * f, at, 0.06, fx, 0.065, 0.02, f, 0.08);
    },
    drop(t) {
      osc("sine", 115, t, 0.09, fx, 0.3, 0.003, 72, 0.08);
      noise(t, 0.06, "lowpass", 700, 0.7, 0.16, 0.002);
      noise(t, 0.03, "bandpass", 3200, 1, 0.03, 0.002);
    },
    shuffle(t) {
      for (let k = 0; k < 9; k++) wood(hz(Math.floor(Math.random() * 10)), t + k * 0.05 * (1 + k * 0.06), 0.3 * GUT);
    },
    land(t) {
      piano(hz(10), t, 0.8 * GUT);
      piano(hz(7), t, 0.5 * GUT);
    },
    sweep(t) {
      noise(t, 0.55, "lowpass", 280, 0.5, 0.07, 0.3, 1100, 0.7);
      marimba(7, t + 0.12, 0.3);
      marimba(5, t + 0.28, 0.3);
      marimba(2, t + 0.44, 0.3);
    },
    copy(t) {
      marimba(7, t, 0.55);
      marimba(10, t + 0.09, 0.6);
    },
    whoosh(t, p) {
      // A stretched band snapping (twang), louder and brighter with power.
      const f0 = hz(5);
      const o = osc("triangle", 1.5 * f0, t, 0.4, fx, 0.2 + 0.3 * p, 0.002, 0.5 * f0, 0.32);
      wobble(o, t, 26, 0.1 * f0, 0.35);
      noise(t, 0.32, "bandpass", 700, 0.8, 0.05 + 0.1 * p, 0.01, 2500 + 2500 * p, 0.32);
    },
    hit(t, p) {
      if (p > 0) {
        // Bullseye: a boom and a fanfare up the scale.
        osc("sine", 130, t, 0.32, fx, 0.5, 0.004, 42, 0.28);
        noise(t, 0.26, "lowpass", 2400, 0.7, 0.3, 0.004, 300, 0.26);
        [0, 2, 4, 5, 7, 9, 10, 12].forEach((s, i) => marimba(s, t + 0.12 + i * 0.085, 0.75));
        const end = t + 0.12 + 8 * 0.085 + 0.06;
        marimba(10, end, 0.8);
        marimba(12, end, 0.7);
        marimba(14, end, 0.6);
        return;
      }
      // A knock: a slap on paper.
      osc("sine", 150, t, 0.12, fx, 0.6, 0.001, 58, 0.1);
      noise(t, 0.07, "lowpass", 1600, 0.7, 0.4, 0.001);
    },
    boing(t) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(330, t + 0.14);
      o.frequency.exponentialRampToValueAtTime(260, t + 0.5);
      const g = ctx.createGain();
      env(g.gain, t, 0.35, 0.01, 0.5);
      o.connect(g).connect(fx);
      wobble(o, t, 16, 70, 0.5);
      o.start(t);
      o.stop(t + 0.6);
    },
    on(t) {
      // Needle drop: a soft thump and two small ticks.
      osc("sine", 92, t, 0.1, fx, 0.093, 0.003, 46, 0.1);
      noise(t, 0.01, "highpass", 2600, 0.7, 0.047, 0.001);
      noise(t, 0.05, "bandpass", 850, 1, 0.021, 0.002);
      noise(t + 0.07, 0.008, "highpass", 3200, 0.7, 0.017, 0.001);
    },
  };

  return {
    ctx,
    play(name: SoundName | "on", pitch = 0) {
      if (ctx.state !== "running") return;
      effects[name](ctx.currentTime + 0.005, pitch);
    },
  };
}
