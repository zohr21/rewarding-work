/**
 * Sound cues (synthesized, no audio files) and a system notification.
 * Nothing plays on page load — audio is unlocked by the user's first click or key press,
 * and notification permission is requested only from the first click on Start.
 */

import { read } from '../storage';

// ---------- Audio ----------

let ctx: AudioContext | null = null;

/** Must be called from a user gesture (browsers block audio otherwise). */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/**
 * Browsers only allow audio after a user gesture. Arm this once per page: the first
 * click or key press anywhere unlocks audio, so a timer that was already running
 * when the page loaded (reload, new tab) can still ring when it ends.
 */
export function armAudioUnlock(): void {
  if (ctx?.state === 'running') return;
  const once = () => {
    unlockAudio();
    if (ctx?.state === 'running' || !ctx) {
      document.removeEventListener('pointerdown', once, true);
      document.removeEventListener('keydown', once, true);
    }
  };
  document.addEventListener('pointerdown', once, true);
  document.addEventListener('keydown', once, true);
}

export const TONES = ['chime', 'bell', 'marimba', 'bowl'] as const;
export type Tone = (typeof TONES)[number];
export const TONE_LABELS: Record<Tone, string> = { chime: 'Chime', bell: 'Bell', marimba: 'Marimba', bowl: 'Singing bowl' };
export const isTone = (v: unknown): v is Tone => (TONES as readonly unknown[]).includes(v);

interface Voice {
  /** Partials as frequency multipliers with relative levels (1 = the note itself). */
  partials: [number, number][];
  type: OscillatorType;
  attack: number;
  decay: number;
  /** Gap between notes, seconds. */
  step: number;
}

const VOICES: Record<Tone, Voice> = {
  chime: { partials: [[1, 1]], type: 'sine', attack: 0.02, decay: 0.9, step: 0.22 },
  // Inharmonic partials give a struck-metal sound.
  bell: { partials: [[1, 1], [2.76, 0.35], [5.4, 0.15]], type: 'sine', attack: 0.005, decay: 1.8, step: 0.3 },
  marimba: { partials: [[1, 1], [4, 0.25]], type: 'triangle', attack: 0.004, decay: 0.45, step: 0.14 },
  bowl: { partials: [[1, 1], [2.02, 0.4], [3.01, 0.12]], type: 'sine', attack: 0.25, decay: 3.2, step: 0.9 },
};

/** Note sequences (Hz). Focus ends rising and a little longer, so it's noticeable; breaks end falling. */
const PHRASES: Record<'focus-end' | 'break-end', Record<Tone, number[]>> = {
  'focus-end': {
    chime: [659.25, 987.77, 659.25, 987.77], // E5 B5 ×2
    bell: [783.99, 1046.5, 783.99, 1046.5], // G5 C6 ×2
    marimba: [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5], // C E G C, G C
    bowl: [392, 523.25], // G4 C5
  },
  'break-end': {
    chime: [987.77, 659.25],
    bell: [1046.5, 783.99],
    marimba: [1046.5, 783.99, 659.25, 523.25],
    bowl: [523.25, 392],
  },
};

function tone(voice: Voice, freq: number, start: number, level: number): void {
  const c = ctx!;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + voice.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + voice.attack + voice.decay);
  gain.connect(c.destination);
  for (const [mult, rel] of voice.partials) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = voice.type;
    osc.frequency.value = freq * mult;
    g.gain.value = rel;
    osc.connect(g).connect(gain);
    osc.start(start);
    osc.stop(start + voice.attack + voice.decay + 0.05);
  }
}

/** End-of-phase sound. `volume` is 0–1. */
export function playChime(kind: 'focus-end' | 'break-end', which: Tone = 'chime', volume = 0.7): void {
  if (!ctx || volume <= 0) return;
  try {
    const voice = VOICES[which];
    const t0 = ctx.currentTime + 0.02;
    PHRASES[kind][which].forEach((freq, i) => {
      // Pause between the two halves of a repeated phrase.
      const pause = kind === 'focus-end' && which !== 'bowl' && i >= PHRASES[kind][which].length / 2 ? voice.step * 2 : 0;
      tone(voice, freq, t0 + i * voice.step + pause, 0.25 * volume);
    });
  } catch {
    /* audio is a nice-to-have */
  }
}

/** A short sparkling arpeggio for reaching a tier; higher tiers get a longer run. */
export function playAchievement(tierIndex: number, volume = 0.7): void {
  if (!ctx || volume <= 0) return;
  try {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].slice(0, 3 + Math.min(tierIndex, 3));
    const t0 = ctx.currentTime + 0.02;
    notes.forEach((f, i) => tone(VOICES.marimba, f, t0 + i * 0.075, 0.16 * volume));
    // A soft sustained chord underneath the last note.
    const last = t0 + notes.length * 0.075;
    [523.25, 783.99, 1046.5].forEach((f) => tone(VOICES.chime, f, last, 0.07 * volume));
  } catch {
    /* audio is a nice-to-have */
  }
}

// ---------- Notifications ----------

export type NotifyPermission = NotificationPermission | 'unsupported';

export function notificationPermission(): NotifyPermission {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

/** Ask once, only if the user hasn't decided yet. */
export async function requestNotificationPermission(): Promise<NotifyPermission> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Show a notification only when the page isn't visible/focused — otherwise the page itself is enough. */
export async function notify(title: string, body: string, icon?: string): Promise<void> {
  if (notificationPermission() !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  const options: NotificationOptions = { body, tag: 'rw-timer', icon };
  try {
    // Some platforms (e.g. Android Chrome) only allow notifications via a service worker.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    /* fall back to the constructor */
  }
  try {
    new Notification(title, options);
  } catch {
    /* unsupported in this context */
  }
}

/** The timer's Sound setting also covers other cues (e.g. reaching a tier). */
export function cueVolume(): number {
  const p = read<Record<string, unknown> | null>('timer-prefs', null);
  if (!p || typeof p !== 'object') return 0.7;
  if (p.sound === false) return 0;
  return typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1 ? p.volume : 0.7;
}
