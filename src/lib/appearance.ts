/**
 * Applies theme + ambient background settings to <html>, and a tiny event bus
 * for "celebrate" moments (session done, item logged, chain marked) that the
 * ambient background reacts to.
 *
 * The same attributes are set before first paint by the inline script in BaseLayout.
 */
import { isScene, type Appearance, type ThemeChoice } from './storage';

export function applyTheme(theme: ThemeChoice): void {
  document.documentElement.dataset.theme = theme;
}

export function applyAppearance(a: Appearance): void {
  const root = document.documentElement;
  root.dataset.bg = a.bg;
  root.dataset.bgKind = isScene(a.bg) ? 'scene' : 'glow';
  root.dataset.motion = a.motion ? 'on' : 'off';
}

const CELEBRATE = 'rw:celebrate';

/** Ask the ambient background for a short, gentle bloom. */
export function celebrate(): void {
  window.dispatchEvent(new CustomEvent(CELEBRATE));
}

export function onCelebrate(callback: () => void): void {
  window.addEventListener(CELEBRATE, callback);
}
