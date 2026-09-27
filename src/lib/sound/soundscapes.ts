/**
 * The synthesised sounds. Each one builds a small audio graph into `out` and returns a
 * stop function (for schedulers and looping sources). Levels are balanced by ear so
 * switching between sounds at the same volume feels roughly equal.
 */
import type { SoundId } from '../storage';
import { burst, chain, filter, gain, loopNoise, midiHz, pan, rand, reverb, scheduler } from './kit';

export type Build = (ctx: AudioContext, out: AudioNode) => () => void;

function stopAll(sources: AudioScheduledSourceNode[], stops: (() => void)[] = []): () => void {
  return () => {
    stops.forEach((s) => s());
    sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
  };
}

/** A slow sine LFO added onto an AudioParam. */
function lfo(ctx: AudioContext, param: AudioParam, hz: number, depth: number): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.frequency.value = hz;
  const g = gain(ctx, depth);
  osc.connect(g).connect(param);
  osc.start();
  return osc;
}

// ---------- Nature ----------

const rain: Build = (ctx, out) => {
  const hiss = loopNoise(ctx, 'pink');
  const hissGain = gain(ctx, 0.32);
  chain(hiss, filter(ctx, 'highpass', 500), filter(ctx, 'lowpass', 6500), hissGain, out);
  const body = loopNoise(ctx, 'brown');
  chain(body, filter(ctx, 'lowpass', 380), gain(ctx, 0.45), out);
  const swell = lfo(ctx, hissGain.gain, 0.031, 0.08);

  // Individual drops on leaves and the window.
  const drops = gain(ctx, 1);
  drops.connect(out);
  const stop = scheduler(ctx, (t) => {
    burst(ctx, drops, t, {
      type: 'bandpass',
      freq: rand(1600, 5200),
      Q: rand(2, 6),
      peak: rand(0.03, 0.14),
      length: rand(0.012, 0.035),
      pan: rand(-0.8, 0.8),
    });
    return rand(0.015, 0.11);
  });
  return stopAll([hiss, body, swell], [stop]);
};

const waves: Build = (ctx, out) => {
  const surf = loopNoise(ctx, 'pink');
  const deep = loopNoise(ctx, 'brown');
  const lp = filter(ctx, 'lowpass', 400);
  const level = gain(ctx, 0.1);
  const mix = gain(ctx, 1);
  surf.connect(mix);
  chain(deep, gain(ctx, 0.8), mix);
  chain(mix, lp, level, out);

  // One wave every 7–12 s: it builds, breaks, and washes back out. Events are scheduled
  // ahead of time, so each wave starts from where the previous one's decay will have got to.
  const settle = Math.exp(-3); // what's left after decaying for three time constants
  let fromLevel = 0.1;
  let fromFreq = 400;
  const stop = scheduler(
    ctx,
    (t) => {
      const period = rand(7, 12);
      const rise = period * rand(0.35, 0.45);
      const peak = rand(0.45, 0.7);
      const peakFreq = rand(1300, 2000);
      level.gain.setValueAtTime(fromLevel, t);
      level.gain.linearRampToValueAtTime(peak, t + rise);
      level.gain.setTargetAtTime(0.08, t + rise, (period - rise) / 3);
      lp.frequency.setValueAtTime(fromFreq, t);
      lp.frequency.exponentialRampToValueAtTime(peakFreq, t + rise);
      lp.frequency.setTargetAtTime(350, t + rise, (period - rise) / 3);
      fromLevel = 0.08 + (peak - 0.08) * settle;
      fromFreq = 350 + (peakFreq - 350) * settle;
      return period;
    },
    14,
  );
  return stopAll([surf, deep], [stop]);
};

const wind: Build = (ctx, out) => {
  const src = loopNoise(ctx, 'pink');
  const bp = filter(ctx, 'bandpass', 500, 0.7);
  const level = gain(ctx, 0.35);
  chain(src, bp, level, out);
  const low = loopNoise(ctx, 'brown');
  chain(low, filter(ctx, 'lowpass', 220), gain(ctx, 0.35), out);
  const whistleSrc = loopNoise(ctx, 'pink');
  const whistle = filter(ctx, 'bandpass', 900, 14);
  const whistleLevel = gain(ctx, 0.25);
  chain(whistleSrc, whistle, whistleLevel, pan(ctx, 0.3), out);

  // Gusts: glide the filter and level to new random targets every few seconds.
  const stop = scheduler(
    ctx,
    (t) => {
      const len = rand(2.5, 6);
      bp.frequency.setTargetAtTime(rand(260, 950), t, len / 3);
      level.gain.setTargetAtTime(rand(0.18, 0.6), t, len / 3);
      whistle.frequency.setTargetAtTime(rand(700, 1400), t, len / 2);
      whistleLevel.gain.setTargetAtTime(rand(0.05, 0.45), t, len / 2);
      return len;
    },
    12,
  );
  return stopAll([src, low, whistleSrc], [stop]);
};

const fire: Build = (ctx, out) => {
  const roar = loopNoise(ctx, 'brown');
  const roarLevel = gain(ctx, 0.4);
  chain(roar, filter(ctx, 'lowpass', 550), roarLevel, out);
  const flicker = lfo(ctx, roarLevel.gain, 0.23, 0.08);

  const crackles = gain(ctx, 1);
  crackles.connect(out);
  const crackle = (t: number, loud: number) =>
    burst(ctx, crackles, t, {
      type: 'highpass',
      freq: rand(1000, 3200),
      peak: loud,
      length: rand(0.003, 0.012),
      pan: rand(-0.6, 0.6),
    });
  const stop = scheduler(ctx, (t) => {
    const r = Math.random();
    if (r < 0.2) {
      // A little cluster of snaps.
      const n = 2 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) crackle(t + i * rand(0.008, 0.03), rand(0.08, 0.35));
    } else if (r < 0.26) {
      // A soft pop from a pocket of sap.
      burst(ctx, crackles, t, { type: 'bandpass', freq: rand(180, 420), Q: 3, peak: rand(0.2, 0.4), length: 0.03, color: 'pink' });
    } else crackle(t, rand(0.03, 0.2));
    return -Math.log(1 - Math.random()) * 0.14; // random (Poisson) spacing
  });
  return stopAll([roar, flicker], [stop]);
};

// ---------- Noise ----------

const brown: Build = (ctx, out) => {
  const src = loopNoise(ctx, 'brown');
  chain(src, filter(ctx, 'lowpass', 900), gain(ctx, 0.5), out);
  return stopAll([src]);
};

const pink: Build = (ctx, out) => {
  const src = loopNoise(ctx, 'pink');
  chain(src, gain(ctx, 0.45), out);
  return stopAll([src]);
};

// ---------- Generative music ----------

/** Slow, open chords (MIDI notes): Cmaj9 – Am9 – Fmaj9 – G6/9. */
const PROGRESSION = [
  [48, 55, 64, 71, 74],
  [45, 52, 60, 67, 71],
  [41, 48, 57, 64, 67],
  [43, 50, 59, 62, 69],
];
/** C major pentatonic, two octaves up — any of these fits every chord above. */
const MELODY = [72, 74, 76, 79, 81, 84, 86, 88];
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

function musicBus(ctx: AudioContext, out: AudioNode, wet: number): { dry: GainNode; stop: () => void } {
  const dry = gain(ctx, 1);
  const room = reverb(ctx, 4.5, 2.5);
  dry.connect(out);
  chain(dry, room, gain(ctx, wet), out);
  return { dry, stop: () => dry.disconnect() };
}

const pads: Build = (ctx, out) => {
  const { dry, stop: stopBus } = musicBus(ctx, out, 0.9);
  const tone = filter(ctx, 'lowpass', 1200);
  const toneLfo = lfo(ctx, tone.frequency, 0.05, 350);
  chain(tone, gain(ctx, 0.5), dry);

  const CHORD = 11; // seconds per chord
  let step = 0;
  const stopChords = scheduler(
    ctx,
    (t) => {
      const notes = PROGRESSION[step++ % PROGRESSION.length]!;
      notes.forEach((n, i) => {
        const env = ctx.createGain();
        const level = 0.07 * (i === 0 ? 1.2 : 1);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(level, t + 3.5);
        env.gain.setValueAtTime(level, t + CHORD - 1);
        env.gain.linearRampToValueAtTime(0.0001, t + CHORD + 3.5);
        env.connect(tone);
        for (const [type, detune] of [['sine', -5], ['triangle', 5]] as const) {
          const osc = ctx.createOscillator();
          osc.type = type;
          osc.frequency.value = midiHz(n);
          osc.detune.value = detune;
          osc.connect(env);
          osc.start(t);
          osc.stop(t + CHORD + 4);
        }
      });
      return CHORD;
    },
    CHORD + 1,
  );

  // Now and then, a soft bell note.
  const stopBells = scheduler(ctx, (t) => {
    if (Math.random() < 0.55) {
      const f = midiHz(pick(MELODY));
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      env.connect(dry);
      [1, 2.76].forEach((ratio, i) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = f * ratio;
        const g = gain(ctx, i ? 0.25 : 1);
        chain(osc, g, env);
        osc.start(t);
        osc.stop(t + 3.6);
      });
    }
    return rand(2.5, 5);
  });

  return stopAll([toneLfo], [stopChords, stopBells, stopBus]);
};

/** A mellow, piano-like note: a few harmonics, the higher ones fading faster. */
function pianoNote(ctx: AudioContext, dest: AudioNode, t: number, midi: number, velocity: number): void {
  const f = midiHz(midi);
  const len = 2.5 + (84 - midi) * 0.06; // low notes ring longer
  [
    [1, 0.6, 1],
    [2, 0.22, 0.6],
    [3, 0.09, 0.4],
    [4, 0.04, 0.3],
  ].forEach(([ratio, amp, decay]) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = f * ratio!;
    const env = ctx.createGain();
    const peak = amp! * velocity * 0.5;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len * decay!);
    chain(osc, env, dest);
    osc.start(t);
    osc.stop(t + len * decay! + 0.05);
  });
}

const piano: Build = (ctx, out) => {
  const { dry, stop: stopBus } = musicBus(ctx, out, 0.7);
  const tone = filter(ctx, 'lowpass', 2600);
  chain(tone, dry);

  const BEAT = 60 / 62;
  let bar = 0;
  const stop = scheduler(
    ctx,
    (t) => {
      const chord = PROGRESSION[bar++ % PROGRESSION.length]!;
      // Bass on beat 1, a loose rising arpeggio, and sometimes a melody note on top.
      pianoNote(ctx, tone, t, chord[0]! - 12, rand(0.7, 0.9));
      const arp = chord.slice(1);
      for (let i = 0; i < 6; i++) {
        if (i > 0 && Math.random() < 0.25) continue;
        const at = t + BEAT * (0.5 + i) + rand(-0.02, 0.02);
        pianoNote(ctx, tone, at, arp[i % arp.length]!, rand(0.45, 0.7));
      }
      for (let beat = 1; beat < 8; beat += 2) {
        if (Math.random() < 0.4) pianoNote(ctx, tone, t + BEAT * beat + rand(0, 0.05), pick(MELODY), rand(0.5, 0.8));
      }
      return BEAT * 8;
    },
    BEAT * 9,
  );
  return stopAll([], [stop, stopBus]);
};

export const SOUNDSCAPES: Record<SoundId, Build> = { rain, waves, wind, fire, brown, pink, pads, piano };
