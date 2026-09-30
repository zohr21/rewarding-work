/**
 * Binaural field recordings used as the bed of the nature sounds (public/sounds, all CC0 —
 * sources are listed in public/sounds/CREDITS.md). They're fetched only when someone picks
 * that sound, then cached by the service worker. Until one has loaded (or if it can't be
 * loaded, e.g. offline on a first visit), the synthesised bed plays instead.
 */
import type { SoundId } from '../storage';
import { url } from '../paths';

export const RECORDINGS: Partial<Record<SoundId, string>> = {
  rain: url('/sounds/rain.m4a'),
  fire: url('/sounds/fire.m4a'),
  waves: url('/sounds/waves.m4a'),
};

/**
 * Level every recording is scaled to, so they sit level with the synthesised sounds — but
 * never so far that peaks pass PEAK (a crackling fire is mostly quiet with loud snaps).
 */
const TARGET_RMS = 0.09;
const PEAK = 0.9;
/** Seconds cross-faded at the loop point. */
const FADE = 3;

const loaded = new WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer | null>>>();

/** A recording, decoded, level-matched and made seamless for `loop = true`. Null if it can't be loaded. */
export function loadRecording(ctx: BaseAudioContext, src: string): Promise<AudioBuffer | null> {
  let cache = loaded.get(ctx);
  if (!cache) loaded.set(ctx, (cache = new Map()));
  let hit = cache.get(src);
  if (!hit) {
    hit = fetch(src)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => seamless(ctx, buf))
      .catch(() => {
        cache.delete(src); // try again next time (e.g. back online)
        return null;
      });
    cache.set(src, hit);
  }
  return hit;
}

/**
 * Folds the last FADE seconds over the first ones with an equal-power cross-fade, so the
 * end runs straight into the start. Also sets the level (TARGET_RMS, PEAK).
 */
function seamless(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  const fade = Math.min(Math.floor(ctx.sampleRate * FADE), Math.floor(buf.length / 3));
  const length = buf.length - fade;
  const out = ctx.createBuffer(2, length, buf.sampleRate);

  let sum = 0;
  let peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]!);
      if (a > peak) peak = a;
      if (i % 4 === 0) sum += a * a;
    }
  }
  const rms = Math.sqrt(sum / ((buf.length / 4) * buf.numberOfChannels)) || 1;
  const scale = Math.min(TARGET_RMS / rms, PEAK / (peak || 1));

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
    const o = out.getChannelData(ch);
    for (let i = 0; i < length; i++) o[i] = d[i]! * scale;
    for (let i = 0; i < fade; i++) {
      const k = (i / fade) * (Math.PI / 2);
      o[i] = (d[i]! * Math.sin(k) + d[length + i]! * Math.cos(k)) * scale;
    }
  }
  return out;
}
