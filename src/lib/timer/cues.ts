/**
 * End-of-phase cues: a short synthesized chime (no audio files) and a system notification.
 * Nothing here runs on page load — audio is unlocked and notification permission is
 * requested only from the user's first click on Start.
 */

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

/** Rising two-note chime when focus ends, falling when a break ends. */
export function playChime(kind: 'focus-end' | 'break-end'): void {
  if (!ctx) return;
  try {
    const notes = kind === 'focus-end' ? [659.25, 987.77] : [987.77, 659.25]; // E5 → B5 / B5 → E5
    const t0 = ctx.currentTime + 0.02;
    notes.forEach((freq, i) => {
      const start = t0 + i * 0.22;
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.95);
    });
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
