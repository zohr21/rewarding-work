/**
 * Wires TimerWidget markup to the pure timer engine, storage and cues.
 * All time maths lives in lib/timer/engine.ts; this file only renders and reacts.
 */
import * as T from '../lib/timer/engine';
import type { TimerState, TimerEvent, CustomDurations } from '../lib/timer/engine';
import { TIMER_MODES, TIMER_MODE_LABELS, type TimerMode } from '../data/taxonomy';
import { addSession, getSessions, read, subscribe, write } from '../lib/storage';
import { notify, notificationPermission, playChime, requestNotificationPermission, unlockAudio } from '../lib/timer/cues';
import { celebrate as celebrateBackground } from '../lib/appearance';

interface TimerPrefs {
  mode: TimerMode;
  sound: boolean;
  custom: CustomDurations;
}

const DEFAULT_PREFS: TimerPrefs = { mode: 'pomodoro', sound: true, custom: T.DEFAULT_CUSTOM };

function isPrefs(v: unknown): v is TimerPrefs {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (TIMER_MODES as readonly unknown[]).includes(p.mode) && typeof p.sound === 'boolean' && typeof p.custom === 'object' && p.custom !== null;
}

const PHASE_LABEL: Record<TimerState['phase'], string> = {
  work: 'Focus',
  'short-break': 'Short break',
  'long-break': 'Long break',
};

// ---------- Formatting ----------

function formatClock(ms: number, roundUp: boolean): string {
  const total = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function minutesText(ms: number): string {
  const min = Math.round(ms / 60_000);
  return `${min} minute${min === 1 ? '' : 's'}`;
}

function spokenDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} seconds`;
  return s === 0 ? `${m} minute${m === 1 ? '' : 's'}` : `${m} minute${m === 1 ? '' : 's'} ${s} seconds`;
}

function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// ---------- Mount ----------

export function mountTimers(): void {
  document.querySelectorAll<HTMLElement>('[data-timer]').forEach((el) => {
    if (el.dataset.mounted) return;
    el.dataset.mounted = '1';
    mountTimer(el);
  });
}

function mountTimer(root: HTMLElement): void {
  const q = <E extends Element>(sel: string) => root.querySelector<E>(sel)!;
  const els = {
    modes: Array.from(root.querySelectorAll<HTMLInputElement>('input[name="timer-mode"]')),
    modeHint: q<HTMLElement>('[data-mode-hint]'),
    custom: q<HTMLElement>('[data-custom]'),
    customWork: q<HTMLInputElement>('[data-custom-work]'),
    customBreak: q<HTMLInputElement>('[data-custom-break]'),
    dial: q<HTMLElement>('[data-dial]'),
    ring: q<SVGCircleElement>('[data-ring]'),
    phase: q<HTMLElement>('[data-phase-label]'),
    time: q<HTMLElement>('[data-time]'),
    dots: q<HTMLElement>('[data-dots]'),
    message: q<HTMLElement>('[data-message]'),
    toggle: q<HTMLButtonElement>('[data-action="toggle"]'),
    stop: q<HTMLButtonElement>('[data-action="stop"]'),
    skip: q<HTMLButtonElement>('[data-action="skip"]'),
    reset: q<HTMLButtonElement>('[data-action="reset"]'),
    label: q<HTMLInputElement>('[data-label]'),
    sound: q<HTMLInputElement>('[data-sound]'),
    notifyStatus: q<HTMLElement>('[data-notify-status]'),
    today: q<HTMLAnchorElement>('[data-today]'),
    live: q<HTMLElement>('[data-live]'),
  };
  const circumference = Number(els.ring.dataset.circumference);
  const baseTitle = document.title;
  const icon = root.dataset.icon;
  const standalone = root.hasAttribute('data-shortcuts');

  let prefs = { ...DEFAULT_PREFS, ...read<TimerPrefs>('timer-prefs', DEFAULT_PREFS, isPrefs) };
  prefs.custom = T.clampCustom(prefs.custom);
  let state = loadState();
  let interval: number | undefined;
  let endTimer: number | undefined;
  let announcedLastMinute = false;
  let lastTimeText = '';

  // ---- State lifecycle ----

  function loadState(): TimerState {
    const stored = read<TimerState | null>('timer', null, (v): v is TimerState | null => v === null || T.isTimerState(v));
    const active = stored && stored.status !== 'idle';
    if (stored && active) {
      // Catch up on anything that finished while no page was open — log it, but stay quiet.
      const { state: caught, events } = T.tick(stored, Date.now());
      events.forEach((e) => handleEvent(e, true));
      if (events.length) {
        const focusMs = events.reduce((sum, e) => sum + (e.type === 'phase-complete' ? e.focusMs : 0), 0);
        const next = caught.status === 'idle' ? 'Start the next one when you are ready.' : 'You are on your break now.';
        setMessage(
          focusMs > 0
            ? `While you were away, your ${minutesText(focusMs)} focus session finished and was logged. ${next}`
            : `Your break finished while you were away. ${next}`,
        );
        write('timer', caught);
      }
      return caught;
    }
    const wanted = standalone ? prefs.mode : ((root.dataset.defaultMode as TimerMode | undefined) ?? prefs.mode);
    const mode = (TIMER_MODES as readonly string[]).includes(wanted) ? wanted : 'pomodoro';
    const cycle = stored && stored.mode === mode ? stored.cycle : 0;
    return T.createState(mode, prefs.custom, stored?.label ?? '', cycle);
  }

  function commit(next: TimerState, events: TimerEvent[] = []): void {
    const phaseChanged = next.phase !== state.phase || next.phaseStartedAt !== state.phaseStartedAt;
    state = next;
    if (phaseChanged) announcedLastMinute = false;
    events.forEach((e) => handleEvent(e, false));
    write('timer', state);
    schedule();
    render();
  }

  function savePrefs(patch: Partial<TimerPrefs>): void {
    prefs = { ...prefs, ...patch };
    write('timer-prefs', prefs);
  }

  // ---- Events from the engine ----

  function handleEvent(e: TimerEvent, silent: boolean): void {
    if (e.type === 'too-short') {
      setMessage('Less than a minute — not logged. Start again whenever you are ready.');
      announce('Stopped. Less than a minute, so it was not logged.');
      return;
    }
    if (e.type === 'partial-session') {
      addSession(e.session);
      setMessage(`Reset. ${minutesText(e.session.focusSeconds * 1000)} of focus still counted.`);
      return;
    }

    // phase-complete
    if (e.session) addSession(e.session);

    // Catch-up on page load: loadState() writes one combined message. (Runs before `state` exists.)
    if (silent) return;

    let text: string;
    let title: string;
    if (e.from === 'work') {
      title = 'Focus session done';
      text =
        e.to === 'work'
          ? `Done — ${minutesText(e.focusMs)} of focus. Ready for the next one.`
          : state.mode === 'flowtime'
            ? `You focused for ${minutesText(e.focusMs)}. Take a ${Math.round(e.breakMs / 60_000)}-minute break.`
            : `Nice work. ${e.to === 'long-break' ? 'Long break' : 'Break'}: ${minutesText(e.breakMs)}.`;
    } else {
      title = 'Break over';
      text = 'Break over. Start the next focus session when you are ready.';
    }

    setMessage(text);
    announce(text);
    if (prefs.sound) playChime(e.from === 'work' ? 'focus-end' : 'break-end');
    void notify(title, text, icon);
    celebrate();
  }

  function celebrate(): void {
    celebrateBackground();
    els.dial.classList.remove('is-complete');
    void els.dial.offsetWidth; // restart the animation
    els.dial.classList.add('is-complete');
    window.setTimeout(() => els.dial.classList.remove('is-complete'), 1000);
  }

  // ---- Scheduling: display refresh + an exact one-shot timeout for the phase end ----

  function schedule(): void {
    window.clearInterval(interval);
    window.clearTimeout(endTimer);
    if (state.status !== 'running') return;
    interval = window.setInterval(onTick, 250);
    const end = T.endsAt(state);
    if (end !== null) endTimer = window.setTimeout(onTick, Math.max(0, end - Date.now()) + 15);
  }

  function onTick(): void {
    const { state: next, events } = T.tick(state, Date.now());
    if (events.length) commit(next, events);
    else renderTime();
  }

  // ---- Rendering ----

  function renderTime(): void {
    const now = Date.now();
    const rem = T.remaining(state, now);
    const countUp = rem === null;
    const text = countUp ? formatClock(T.elapsed(state, now), false) : formatClock(rem, true);

    if (text !== lastTimeText) {
      lastTimeText = text;
      els.time.textContent = text;
    }

    const progress = countUp || !state.durationMs ? 0 : 1 - rem! / state.durationMs;
    els.ring.style.strokeDashoffset = String(circumference * Math.min(1, Math.max(0, progress)));

    if (state.status === 'idle') {
      document.title = baseTitle;
    } else {
      const prefix = state.status === 'paused' ? '⏸ ' : '';
      document.title = `${prefix}${text} · ${PHASE_LABEL[state.phase]}`;
    }

    if (!countUp && state.status === 'running' && rem! <= 60_000 && rem! > 0 && !announcedLastMinute) {
      announcedLastMinute = true;
      announce(`One minute left in this ${state.phase === 'work' ? 'focus session' : 'break'}.`);
    }
  }

  function render(): void {
    const { mode, phase, status } = state;
    const inPhase = status !== 'idle' || phase !== 'work';
    const countUp = state.durationMs === null;

    root.dataset.phase = phase;
    root.dataset.status = status;
    root.toggleAttribute('data-countup', countUp);

    for (const input of els.modes) {
      input.checked = input.value === mode;
      input.disabled = inPhase && input.value !== mode;
    }
    els.modeHint.hidden = !inPhase;

    els.custom.hidden = mode !== 'custom';
    els.customWork.disabled = els.customBreak.disabled = inPhase;
    if (document.activeElement !== els.customWork) els.customWork.value = String(state.custom.workMin);
    if (document.activeElement !== els.customBreak) els.customBreak.value = String(state.custom.breakMin);

    els.phase.textContent = phase === 'work' && countUp ? 'Focus · counting up' : PHASE_LABEL[phase];

    const showDots = mode === 'pomodoro';
    els.dots.hidden = !showDots;
    if (showDots) {
      const filled = Math.min(state.cycle, T.POMODORO.longEvery);
      Array.from(els.dots.children).forEach((d, i) => d.classList.toggle('is-done', i < filled));
      els.dots.setAttribute('aria-label', `${filled} of ${T.POMODORO.longEvery} sessions before a long break`);
    }

    els.toggle.textContent = status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : phase === 'work' ? 'Start focus' : 'Start break';
    els.stop.hidden = !(mode === 'flowtime' && phase === 'work' && status !== 'idle');
    els.skip.hidden = !T.isBreak(phase);
    els.reset.disabled = !inPhase;

    if (document.activeElement !== els.label) els.label.value = state.label;
    els.sound.checked = prefs.sound;

    renderNotifyStatus();
    renderToday();
    lastTimeText = '';
    renderTime();
  }

  function renderNotifyStatus(): void {
    const p = notificationPermission();
    els.notifyStatus.textContent =
      p === 'granted'
        ? 'Notifications on'
        : p === 'denied'
          ? 'Notifications blocked in browser settings'
          : p === 'default'
            ? "You'll be asked about notifications when you start"
            : '';
  }

  function renderToday(): void {
    const now = Date.now();
    const today = getSessions().filter((s) => isSameLocalDay(s.start, now));
    if (!today.length) {
      els.today.textContent = '';
      return;
    }
    const mins = Math.round(today.reduce((sum, s) => sum + s.focusSeconds, 0) / 60);
    const done = today.filter((s) => s.completed).length;
    els.today.textContent = `Today: ${done} session${done === 1 ? '' : 's'} · ${mins} min focused`;
  }

  function setMessage(text: string): void {
    els.message.textContent = text;
  }

  function announce(text: string): void {
    // Clear first so repeating the same text is still announced.
    els.live.textContent = '';
    window.setTimeout(() => (els.live.textContent = text), 50);
  }

  // ---- Actions ----

  async function onToggle(): Promise<void> {
    const wasIdle = state.status === 'idle';
    const wasRunning = state.status === 'running';
    unlockAudio(); // needs this click as the user gesture
    const now = Date.now();
    commit(T.toggle(state, now));

    if (wasRunning) {
      const rem = T.remaining(state, now);
      announce(rem === null ? `Paused at ${spokenDuration(T.elapsed(state, now))}.` : `Paused. ${spokenDuration(rem)} left.`);
    } else {
      if (wasIdle) setMessage('');
      const rem = T.remaining(state, now);
      announce(
        `${PHASE_LABEL[state.phase]} ${wasIdle ? 'started' : 'resumed'}${rem === null ? ', counting up' : `, ${spokenDuration(rem)}`}.`,
      );
      // First start: ask about notifications (never on page load).
      if (notificationPermission() === 'default') {
        await requestNotificationPermission();
        renderNotifyStatus();
      }
    }
  }

  function onReset(): void {
    const r = T.reset(state, Date.now());
    if (!r.events.length) setMessage('');
    commit(r.state, r.events);
    announce('Timer reset.');
  }

  els.toggle.addEventListener('click', () => void onToggle());
  els.reset.addEventListener('click', onReset);
  els.skip.addEventListener('click', () => {
    commit(T.skipBreak(state));
    setMessage('Break skipped. Start when you are ready.');
    announce('Break skipped.');
  });
  els.stop.addEventListener('click', () => {
    const r = T.stopFlow(state, Date.now());
    commit(r.state, r.events);
  });

  for (const input of els.modes) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      const mode = input.value as TimerMode;
      savePrefs({ mode });
      setMessage('');
      commit(T.setMode(state, mode));
      announce(`${TIMER_MODE_LABELS[mode]} mode.`);
    });
  }

  function onCustomChange(): void {
    const custom = T.clampCustom({ workMin: Number(els.customWork.value), breakMin: Number(els.customBreak.value) });
    savePrefs({ custom });
    commit(T.setCustom(state, custom));
  }
  els.customWork.addEventListener('change', onCustomChange);
  els.customBreak.addEventListener('change', onCustomChange);

  els.label.addEventListener('input', () => {
    state = T.setLabel(state, els.label.value);
    write('timer', state);
  });

  els.sound.addEventListener('change', () => {
    savePrefs({ sound: els.sound.checked });
    if (els.sound.checked) {
      unlockAudio();
      playChime('focus-end'); // preview so people know what to expect
    }
  });

  // Keyboard shortcuts (standalone page only, so Space still scrolls long technique pages).
  if (standalone) {
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        void onToggle();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        onReset();
      }
    });
  }

  // Background tabs: timers get throttled, so re-sync the instant the tab is visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onTick();
  });

  // Keep several open tabs in sync (session ids are stable, so no double logging).
  subscribe(
    'timer',
    () => {
      const stored = read<TimerState | null>('timer', null, (v): v is TimerState | null => v === null || T.isTimerState(v));
      if (!stored) return;
      state = stored;
      schedule();
      render();
    },
    { otherTabsOnly: true },
  );
  subscribe('sessions', renderToday);

  render();
  schedule();
}
