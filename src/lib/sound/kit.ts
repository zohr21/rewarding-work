/**
 * Building blocks for the synthesised soundscapes: looping noise, filters,
 * a reverb, and a look-ahead scheduler for random events (rain drops, crackles, notes).
 */

export type NoiseColor = 'white' | 'pink' | 'brown';

const buffers = new WeakMap<BaseAudioContext, Map<NoiseColor, AudioBuffer>>();

/** 8 s of stereo noise, generated once per context. Each channel is independent. */
export function noiseBuffer(ctx: BaseAudioContext, color: NoiseColor): AudioBuffer {
  let cache = buffers.get(ctx);
  if (!cache) buffers.set(ctx, (cache = new Map()));
  const hit = cache.get(color);
  if (hit) return hit;

  const length = ctx.sampleRate * 8;
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; // pink (Paul Kellet)
    let last = 0; // brown
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'white') d[i] = w * 0.5;
      else if (color === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // Cross-fade the ends so the loop point is inaudible.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i]! * k + d[length - fade + i]! * (1 - k);
    }
  }
  cache.set(color, buf);
  return buf;
}

/** A looping noise source, started at a random offset. */
export function loopNoise(ctx: AudioContext, color: NoiseColor): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, color);
  src.loop = true;
  src.start(0, Math.random() * 7);
  return src;
}

export function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, Q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

export function gain(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** Connects nodes in order and returns the last one. */
export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!);
  return nodes[nodes.length - 1]!;
}

export function pan(ctx: BaseAudioContext, value: number): AudioNode {
  if (typeof ctx.createStereoPanner !== 'function') return gain(ctx, 1);
  const p = ctx.createStereoPanner();
  p.pan.value = value;
  return p;
}

export type Point = readonly [x: number, y: number, z: number];

/**
 * A point in 3D space around the listener, heard through HRTF: the filtering done by the
 * shape of the head and ears, which lets headphones place a sound above, behind or far
 * away rather than just left or right. The listener sits at the origin facing -z, y is up.
 * Distances are in metres.
 */
export function place(ctx: BaseAudioContext, at: Point): PannerNode {
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 1;
  p.rolloffFactor = 1;
  move(p, at, 0, 0);
  return p;
}

/** Glide a placed sound towards `to`, starting at audio time `at` (0 = jump there now). */
export function move(p: PannerNode, to: Point, at: number, seconds: number): void {
  if (!p.positionX) {
    p.setPosition(...to); // Safari < 14.1 / Firefox < 90
    return;
  }
  [p.positionX, p.positionY, p.positionZ].forEach((param, i) => {
    if (seconds > 0) param.setTargetAtTime(to[i]!, at, seconds / 3);
    else param.value = to[i]!;
  });
}

/** A soft room: generated stereo impulse response with an exponential tail. */
export function reverb(ctx: BaseAudioContext, seconds = 4, decay = 3): ConvolverNode {
  const length = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  return conv;
}

/**
 * A short burst of noise (a drop, a crackle): filtered, with a fast decay. Panned if `pan`
 * is given; for a position in 3D, send it to a `place()` node instead.
 */
export function burst(
  ctx: AudioContext,
  dest: AudioNode,
  at: number,
  o: { color?: NoiseColor; type: BiquadFilterType; freq: number; Q?: number; peak: number; length: number; pan?: number },
): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, o.color ?? 'white');
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(o.peak, at + Math.min(0.004, o.length / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, at + o.length);
  chain(src, filter(ctx, o.type, o.freq, o.Q ?? 1), env, ...(o.pan === undefined ? [] : [pan(ctx, o.pan)]), dest);
  src.start(at, Math.random() * 7, o.length + 0.05);
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * Look-ahead scheduler: calls `next(time)` for every event due in the next few
 * seconds of audio time; `next` schedules the event and returns the gap until the
 * following one. Audio time stands still while the context is suspended, so pausing
 * needs no special handling. Returns a stop function.
 */
export function scheduler(ctx: AudioContext, next: (time: number) => number, lookahead = 3): () => void {
  let t = ctx.currentTime + 0.05;
  const pump = () => {
    // Don't try to catch up on a backlog (e.g. after the tab was frozen).
    if (t < ctx.currentTime) t = ctx.currentTime + 0.05;
    let guard = 0;
    while (t < ctx.currentTime + lookahead && guard++ < 500) t += Math.max(0.005, next(t));
  };
  pump();
  const id = window.setInterval(pump, 400);
  return () => window.clearInterval(id);
}
