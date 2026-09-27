/**
 * Background sound player: one source at a time — a synthesised soundscape (Web Audio)
 * or a YouTube video in a small floating player.
 *
 * This module lives for the whole visit. With the client-side router it isn't
 * re-run on navigation, so sound keeps playing from page to page; the YouTube player
 * is attached outside <body> for the same reason (the router replaces <body>).
 *
 * Browsers only allow sound after a user gesture, so nothing starts on page load:
 * after a full reload, the Sound menu shows "Play" and waits for a click.
 */
import { getSoundPrefs, setSoundPrefs, type SoundId, type SoundSource } from '../storage';
import { SOUNDSCAPES } from './soundscapes';
import { embedUrl, parseYouTube } from './youtube';

export interface PlayerState {
  playing: boolean;
  source: SoundSource;
}

type Listener = (s: PlayerState) => void;
const listeners = new Set<Listener>();
let playing = false;

function state(): PlayerState {
  return { playing, source: getSoundPrefs().source };
}

function emit(): void {
  const s = state();
  listeners.forEach((fn) => fn(s));
}

export function onPlayerChange(fn: Listener): () => void {
  listeners.add(fn);
  fn(state());
  return () => listeners.delete(fn);
}

/** Perceived loudness is roughly logarithmic; squaring makes the slider feel even. */
const curve = (v: number) => v * v;

// ---------- Synthesised sounds ----------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let voice: { id: SoundId; out: GainNode; stop: () => void } | null = null;
let suspendTimer = 0;

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  // Safari 17+: keep playing when the ringer switch is on silent, like a music app.
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  ctx = new Ctor({ latencyHint: 'playback' });
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  return ctx;
}

function startVoice(id: SoundId): void {
  if (!ctx || !master) return;
  if (voice?.id === id) return;
  stopVoice(1.5);
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(1, ctx.currentTime, 0.6); // fade in over ~2 s
  out.connect(master);
  const stop = SOUNDSCAPES[id](ctx, out);
  voice = { id, out, stop };
}

function stopVoice(fade = 0.4): void {
  if (!voice || !ctx) return;
  const { out, stop } = voice;
  voice = null;
  out.gain.cancelScheduledValues(ctx.currentTime);
  out.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
  window.setTimeout(() => {
    stop();
    out.disconnect();
  }, fade * 1000 + 300);
}

function playSynth(id: SoundId): void {
  const c = ensureContext();
  if (!c || !master) return;
  window.clearTimeout(suspendTimer);
  void c.resume();
  startVoice(id);
  master.gain.cancelScheduledValues(c.currentTime);
  master.gain.setTargetAtTime(curve(getSoundPrefs().volume), c.currentTime, 0.15);
}

function pauseSynth(): void {
  if (!ctx || !master) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
  // Suspending stops the audio thread entirely (no CPU / battery while paused).
  window.clearTimeout(suspendTimer);
  suspendTimer = window.setTimeout(() => void ctx?.suspend(), 600);
}

// ---------- YouTube ----------

let dock: HTMLElement | null = null;
let frame: HTMLIFrameElement | null = null;
let dockUrl = '';

function command(func: string, args: unknown[] = []): void {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}

function onYouTubeMessage(e: MessageEvent): void {
  if (!frame || e.source !== frame.contentWindow) return;
  let data: { event?: string; info?: unknown };
  try {
    data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
  } catch {
    return;
  }
  // Player states: 1 playing, 2 paused, 0 ended. Keep our Play/Pause button honest
  // when someone uses the player's own controls.
  let ps: unknown;
  if (data.event === 'onStateChange') ps = data.info;
  else if (data.event === 'infoDelivery' && typeof data.info === 'object' && data.info) ps = (data.info as { playerState?: unknown }).playerState;
  if (ps === 1 && !playing) {
    playing = true;
    emit();
  } else if ((ps === 2 || ps === 0) && playing && getSoundPrefs().source === 'youtube') {
    playing = false;
    emit();
  }
}

function openYouTube(link: string): boolean {
  const ref = parseYouTube(link);
  if (!ref) return false;
  const src = embedUrl(ref, location.origin);
  if (dock && frame && dockUrl === src) {
    command('playVideo');
    return true;
  }
  closeYouTube();

  dock = document.createElement('div');
  dock.className = 'sound-dock';
  dock.setAttribute('role', 'region');
  dock.setAttribute('aria-label', 'YouTube player');
  const bar = document.createElement('div');
  bar.className = 'sound-dock__bar';
  const title = document.createElement('span');
  title.textContent = 'Playing from YouTube';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'sound-dock__close';
  close.setAttribute('aria-label', 'Stop and close the YouTube player');
  close.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  close.addEventListener('click', () => {
    closeYouTube();
    playing = false;
    emit();
  });
  bar.append(title, close);

  frame = document.createElement('iframe');
  frame.title = 'YouTube player';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.src = src;
  frame.addEventListener('load', () => {
    // Ask the player to report state changes, then apply our volume.
    frame?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'rw', channel: 'widget' }), '*');
    window.setTimeout(() => command('setVolume', [Math.round(getSoundPrefs().volume * 100)]), 600);
  });
  dock.append(bar, frame);
  // Outside <body>: the client-side router swaps <body> on navigation, and moving an
  // iframe in the DOM reloads it. Here it's never touched, so playback continues.
  document.documentElement.append(dock);
  dockUrl = src;
  window.addEventListener('message', onYouTubeMessage);
  return true;
}

function closeYouTube(): void {
  window.removeEventListener('message', onYouTubeMessage);
  dock?.remove();
  dock = null;
  frame = null;
  dockUrl = '';
}

// ---------- Public API (call play/toggle from a click or key press) ----------

/** Start `source` (or the saved one). Returns false if a YouTube link is missing/invalid. */
export function play(source?: SoundSource): boolean {
  const prefs = getSoundPrefs();
  const next = source ?? prefs.source;
  if (next !== prefs.source) setSoundPrefs({ ...prefs, source: next });

  if (next === 'youtube') {
    if (!openYouTube(prefs.youtube)) {
      emit();
      return false;
    }
    stopVoice();
    pauseSynth();
  } else {
    closeYouTube();
    playSynth(next);
  }
  playing = true;
  emit();
  return true;
}

export function pause(): void {
  if (getSoundPrefs().source === 'youtube') command('pauseVideo');
  pauseSynth();
  playing = false;
  emit();
}

export function toggle(): void {
  if (playing) pause();
  else play();
}

export function isPlaying(): boolean {
  return playing;
}

export function setVolume(v: number): void {
  const volume = Math.min(1, Math.max(0, v));
  setSoundPrefs({ ...getSoundPrefs(), volume });
  if (ctx && master && playing && getSoundPrefs().source !== 'youtube') {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(curve(volume), ctx.currentTime, 0.05);
  }
  command('setVolume', [Math.round(volume * 100)]);
}

/** Save a YouTube link and play it. Returns false if it isn't a YouTube video/playlist link. */
export function playYouTube(link: string): boolean {
  if (!parseYouTube(link)) return false;
  setSoundPrefs({ ...getSoundPrefs(), youtube: link.trim(), source: 'youtube' });
  return play('youtube');
}
