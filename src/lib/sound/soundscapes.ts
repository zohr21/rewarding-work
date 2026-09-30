/**
 * The background sounds. Each one builds a small audio graph into `out` and returns a
 * stop function (for schedulers and looping sources). Levels are balanced by ear so
 * switching between sounds at the same volume feels roughly equal.
 */
import type { SoundId } from '../storage';
import { burst, chain, filter, gain, loopNoise, midiHz, move, noiseBuffer, pan, place, rand, reverb, scheduler, type Point } from './kit';
import { loadRecording, RECORDINGS } from './recordings';

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

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

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
//
// Rain, waves and fire are a binaural field recording (recordings.ts) with details placed
// around the listener in 3D on top: drops on the roof above, a gutter dripping behind you,
// sparks rising out of the fire. The details move and never repeat, so the loop doesn't
// feel like one. Until the recording has loaded the synthesised bed plays, and it stays
// as the fallback when the file can't be fetched.

/**
 * Swaps the synthesised bed for the recording of `id` once it has loaded: `synth` (a gain
 * the synthesised sources run through) fades out and its sources stop. Returns a stop function.
 */
function recordedBed(
  ctx: AudioContext,
  out: AudioNode,
  id: SoundId,
  synth: GainNode,
  synthSources: AudioScheduledSourceNode[],
  onReady: () => void,
): () => void {
  const src = RECORDINGS[id];
  let stopped = false;
  let rec: AudioBufferSourceNode | null = null;
  if (src)
    void loadRecording(ctx, src).then((buf) => {
      if (!buf || stopped) return;
      rec = ctx.createBufferSource();
      rec.buffer = buf;
      rec.loop = true;
      const level = gain(ctx, 0);
      chain(rec, level, out);
      rec.start(0, Math.random() * buf.duration);
      const t = ctx.currentTime;
      level.gain.setTargetAtTime(1, t, 0.8);
      synth.gain.setTargetAtTime(0, t, 0.8);
      synthSources.forEach((s) => s.stop(t + 5));
      onReady();
    });
  return () => {
    stopped = true;
    try {
      rec?.stop();
    } catch {
      /* not started */
    }
  };
}

/** Fixed points in 3D that feed `out`. */
const spots = (ctx: AudioContext, out: AudioNode, points: Point[]) =>
  points.map((at) => {
    const p = place(ctx, at);
    p.connect(out);
    return p;
  });

const rain: Build = (ctx, out) => {
  const bed = gain(ctx, 1);
  bed.connect(out);
  const hiss = loopNoise(ctx, 'pink');
  const hissGain = gain(ctx, 0.32);
  chain(hiss, filter(ctx, 'highpass', 500), filter(ctx, 'lowpass', 6500), hissGain, bed);
  const body = loopNoise(ctx, 'brown');
  chain(body, filter(ctx, 'lowpass', 380), gain(ctx, 0.45), bed);
  const swell = lfo(ctx, hissGain.gain, 0.031, 0.08);

  // Once the recording plays it carries the texture; the drops thin out to the odd close one.
  let sparse = false;
  const stopBed = recordedBed(ctx, out, 'rain', bed, [hiss, body, swell], () => (sparse = true));

  // Drops on the roof above you and on the windows either side.
  const roof = spots(ctx, out, [
    [-1.2, 1.6, -0.4],
    [0.9, 1.8, -0.8],
    [0.2, 1.5, 0.9],
    [-0.7, 1.7, 1.2],
  ]);
  const windows = spots(ctx, out, [
    [1.4, 0.3, -0.2],
    [-1.5, 0.2, -0.6],
  ]);
  const stopDrops = scheduler(ctx, (t) => {
    const onRoof = Math.random() < 0.6;
    burst(ctx, pick(onRoof ? roof : windows), t, {
      type: 'bandpass',
      freq: onRoof ? rand(900, 2800) : rand(2200, 5200),
      Q: rand(2, 6),
      peak: rand(0.04, 0.18) * (sparse ? 1.4 : 1),
      length: rand(0.012, 0.035),
    });
    return sparse ? rand(0.08, 0.5) : rand(0.015, 0.11);
  });

  // A gutter dripping behind you on the right: a little pitched plink every second or two.
  const gutter = place(ctx, [1.6, 0.8, 1.4]);
  gutter.connect(out);
  const stopGutter = scheduler(ctx, (t) => {
    const osc = ctx.createOscillator();
    const f = rand(1100, 1350);
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.05);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(rand(0.05, 0.1), t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    chain(osc, env, gutter);
    osc.start(t);
    osc.stop(t + 0.1);
    return rand(0.9, 2.4);
  });

  // Now and then, thunder rolling far off to one side.
  const thunder = place(ctx, [0, 3, -8]);
  thunder.connect(out);
  let first = true; // not right as it starts
  const stopThunder = scheduler(ctx, (t) => {
    if (first) first = false;
    else if (Math.random() < 0.6) {
      move(thunder, [rand(-8, 8), 3, rand(-8, -4)], 0, 0);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 'brown');
      const env = ctx.createGain();
      const len = rand(6, 10);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(rand(1.2, 2), t + rand(0.8, 2));
      env.gain.exponentialRampToValueAtTime(0.0001, t + len);
      chain(src, filter(ctx, 'lowpass', 140), env, thunder);
      src.start(t, Math.random() * 7, len + 0.1);
    }
    return rand(45, 120);
  });
  return stopAll([hiss, body, swell], [stopBed, stopDrops, stopGutter, stopThunder]);
};

const waves: Build = (ctx, out) => {
  const bed = gain(ctx, 1);
  bed.connect(out);
  const surf = loopNoise(ctx, 'pink');
  const deep = loopNoise(ctx, 'brown');
  const lp = filter(ctx, 'lowpass', 400);
  const level = gain(ctx, 0.1);
  const mix = gain(ctx, 1);
  surf.connect(mix);
  chain(deep, gain(ctx, 0.8), mix);
  chain(mix, lp, level, bed);

  // One wave every 7–12 s: it builds, breaks, and washes back out. Events are scheduled
  // ahead of time, so each wave starts from where the previous one's decay will have got to.
  const settle = Math.exp(-3); // what's left after decaying for three time constants
  let fromLevel = 0.1;
  let fromFreq = 400;
  const stopSwell = scheduler(
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
  const stopBed = recordedBed(ctx, out, 'waves', bed, [surf, deep], () => stopSwell());

  // Foam: after a wave breaks in front of you, its fizz spreads along the shore to one
  // side and runs up closer before sinking into the sand.
  const stopFoam = scheduler(
    ctx,
    (t) => {
      const side = Math.random() < 0.5 ? -1 : 1;
      const len = rand(3, 5);
      const at = place(ctx, [rand(-1.5, 1.5), -0.6, -5]);
      move(at, [side * rand(2.5, 4.5), -0.9, rand(-2.2, -1.2)], t, len);
      at.connect(out);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 'pink');
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(rand(0.25, 0.4), t + len * 0.25);
      env.gain.exponentialRampToValueAtTime(0.0001, t + len);
      chain(src, filter(ctx, 'highpass', 1800), filter(ctx, 'lowpass', rand(6000, 9000)), env, at);
      src.start(t, Math.random() * 7, len + 0.1);
      src.onended = () => at.disconnect();
      return rand(6, 11);
    },
    6,
  );
  return stopAll([surf, deep], [stopSwell, stopBed, stopFoam]);
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
  const bed = gain(ctx, 1);
  bed.connect(out);
  const roar = loopNoise(ctx, 'brown');
  const roarLevel = gain(ctx, 0.4);
  chain(roar, filter(ctx, 'lowpass', 550), roarLevel, bed);
  const flicker = lfo(ctx, roarLevel.gain, 0.23, 0.08);

  let sparse = false;
  const stopBed = recordedBed(ctx, out, 'fire', bed, [roar, flicker], () => (sparse = true));

  // The fire is in front of you and a little below, about as wide as a hearth.
  const logs = spots(ctx, out, [
    [-0.5, -0.5, -1.3],
    [-0.2, -0.55, -1.2],
    [0.1, -0.5, -1.4],
    [0.4, -0.55, -1.25],
  ]);
  const crackle = (to: AudioNode, t: number, loud: number) =>
    burst(ctx, to, t, { type: 'highpass', freq: rand(1000, 3200), peak: loud, length: rand(0.003, 0.012) });
  const stopCrackles = scheduler(ctx, (t) => {
    const log = pick(logs);
    const r = Math.random();
    if (r < 0.2) {
      // A little cluster of snaps.
      const n = 2 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) crackle(log, t + i * rand(0.008, 0.03), rand(0.08, 0.35));
    } else if (r < 0.26) {
      // A soft pop from a pocket of sap.
      burst(ctx, log, t, { type: 'bandpass', freq: rand(180, 420), Q: 3, peak: rand(0.2, 0.4), length: 0.03, color: 'pink' });
    } else crackle(log, t, rand(0.03, 0.2));
    return -Math.log(1 - Math.random()) * (sparse ? 0.45 : 0.14); // random (Poisson) spacing
  });

  // Every so often a spark pops and drifts up out of the fire, ticking as it goes.
  const stopSparks = scheduler(ctx, (t) => {
    const x = rand(-0.4, 0.4);
    const len = rand(1.2, 2.2);
    const spark = place(ctx, [x, -0.5, -1.3]);
    move(spark, [x + rand(-0.4, 0.4), rand(0.6, 1.2), rand(-1.2, -0.6)], t, len);
    spark.connect(out);
    crackle(spark, t, rand(0.25, 0.4));
    const ticks = 3 + Math.floor(Math.random() * 4);
    for (let i = 1; i <= ticks; i++) {
      const fade = 1 - i / (ticks + 1);
      burst(ctx, spark, t + len * (1 - fade), { type: 'highpass', freq: rand(4000, 7000), peak: 0.02 + 0.08 * fade, length: 0.004 });
    }
    window.setTimeout(() => spark.disconnect(), (t - ctx.currentTime + len + 1) * 1000);
    return rand(5, 14);
  });

  // A faint draught through the room behind you.
  const draught = loopNoise(ctx, 'pink');
  const draughtLevel = gain(ctx, 0.05);
  chain(draught, filter(ctx, 'bandpass', 420, 0.8), draughtLevel, place(ctx, [0.3, 0.6, 2.5]), out);
  const gusts = lfo(ctx, draughtLevel.gain, 0.07, 0.035);

  return stopAll([roar, flicker, draught, gusts], [stopBed, stopCrackles, stopSparks]);
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
