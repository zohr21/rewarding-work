/**
 * Mounts the 3D tree above the dial on /timer and feeds it the shared timer state.
 * three.js loads only here, and only when the tree's spot is actually shown, so other
 * pages (and short phone screens, where CSS hides the spot) never download it.
 */
import { webglAvailable } from '../lib/scene';
import type { Tree, TreeMode, TreeState } from '../lib/scene/tree';
import { read, subscribe } from '../lib/storage';
import { elapsed, isBreak, isTimerState, type TimerState } from '../lib/timer/engine';

/** Flowtime counts up with no end; the tree is fully grown after an hour. */
const FLOW_FULL_MS = 60 * 60_000;
/** While a session runs the tree is re-fed this often (it eases between updates). */
const TICK_MS = 2000;

function treeState(t: TimerState | null, now: number): TreeState {
  if (!t || t.status === 'idle') return { progress: 0, mode: 'idle' };
  if (isBreak(t.phase)) return { progress: 1, mode: t.status === 'paused' ? 'paused' : 'break' };
  const done = elapsed(t, now);
  const progress = t.durationMs ? done / t.durationMs : done / FLOW_FULL_MS;
  const mode: TreeMode = t.status === 'running' ? 'running' : 'paused';
  return { progress: Math.min(1, progress), mode };
}

/** Day number, so the tree keeps its shape all day and changes tomorrow. */
const todaySeed = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);

export function mountFocusTree(): (() => void) | void {
  const spot = document.querySelector<HTMLElement>('[data-focus-tree]');
  const canvas = spot?.querySelector('canvas');
  if (!spot || !canvas || !webglAvailable()) return;
  if (getComputedStyle(spot).display === 'none') return;

  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const look = () => {
    const css = getComputedStyle(spot);
    return {
      dark: root.dataset.theme === 'dark' || (root.dataset.theme === 'auto' && darkScheme.matches),
      glow: css.getPropertyValue('--glow').trim(),
      firefly: css.getPropertyValue('--firefly').trim(),
      motion: root.dataset.motion !== 'off' && !reduced.matches,
      base: parseFloat(css.getPropertyValue('--tree-base')) || 0.35,
    };
  };
  const timer = () => read<TimerState | null>('timer', null, (v): v is TimerState | null => v === null || isTimerState(v));

  let tree: Tree | null = null;
  let gone = false;
  let tick = 0;

  const feed = () => tree?.update(treeState(timer(), Date.now()));
  const restyle = () => tree?.setLook(look());

  void import('../lib/scene/tree').then(({ createTree }) => {
    if (gone) return;
    tree = createTree(canvas, look(), todaySeed());
    if (!tree) return;
    spot.classList.add('is-ready');
    feed();
    tick = window.setInterval(() => {
      if (timer()?.status === 'running') feed();
    }, TICK_MS);
  });

  const unsubscribe = subscribe('timer', feed);
  const themeWatch = new MutationObserver(restyle);
  themeWatch.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });
  reduced.addEventListener('change', restyle);
  darkScheme.addEventListener('change', restyle);

  return () => {
    gone = true;
    window.clearInterval(tick);
    unsubscribe();
    themeWatch.disconnect();
    reduced.removeEventListener('change', restyle);
    darkScheme.removeEventListener('change', restyle);
    tree?.destroy();
    tree = null;
  };
}
