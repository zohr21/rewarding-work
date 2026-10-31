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

export interface CelebrateDetail {
  /** Where the finished thing was on screen, when a spark should fly from it to the Grove. */
  from?: DOMRect;
}

/**
 * Ask the ambient background for a short, gentle bloom. Pass the element that was finished
 * (e.g. the Done button) and a spark also flies from it to the Grove link (GroveSpark.astro).
 * Call it before the element is re-rendered away: its position is read right here.
 */
export function celebrate(from?: Element | null): void {
  const rect = from?.getBoundingClientRect();
  const detail: CelebrateDetail = rect && rect.width ? { from: rect } : {};
  window.dispatchEvent(new CustomEvent<CelebrateDetail>(CELEBRATE, { detail }));
}

export function onCelebrate(callback: (detail: CelebrateDetail) => void): void {
  window.addEventListener(CELEBRATE, (e) => callback((e as CustomEvent<CelebrateDetail>).detail ?? {}));
}
