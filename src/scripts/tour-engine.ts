/**
 * The spotlight: dims the page around one real thing at a time and puts a small tip beside
 * it. Used for tours (src/lib/tours.ts) and for a tip's "Show me" (src/lib/help.ts).
 * Guide.astro decides when; this file only draws and steps through.
 */
import { el } from '../lib/dom';
import { cleanups, listen } from '../lib/page';
import type { TourStep } from '../lib/tours';

const GAP = 12;

/** The first match that is actually on screen (not hidden, not zero-sized). */
export function visible(selector: string): HTMLElement | null {
  let nodes: NodeListOf<HTMLElement>;
  try {
    nodes = document.querySelectorAll<HTMLElement>(selector);
  } catch {
    return null;
  }
  for (const node of nodes) {
    if (node.closest('[hidden]') || node.closest('dialog:not([open])')) continue;
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return node;
  }
  return null;
}

export interface Spotlight {
  name: string;
  steps: TourStep[];
  /** End on a tip pointing at the ? button, so people know where tours live. */
  sayWhere?: boolean;
}

let stopCurrent: (() => void) | null = null;

export function stopSpotlight(): void {
  stopCurrent?.();
}

/** Runs it; returns false when nothing it points at is on the page. */
export function runSpotlight(run: Spotlight): boolean {
  stopCurrent?.();
  const steps: (TourStep & { node: HTMLElement })[] = [];
  for (const s of run.steps) {
    const node = visible(s.target);
    if (node) steps.push({ ...s, node });
  }
  if (!steps.length) return false;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';
  const c = cleanups();
  const spot = el('div', 'tour-spot');
  spot.setAttribute('aria-hidden', 'true');
  const tip = el('div', 'tour-tip');
  tip.setAttribute('role', 'dialog');
  tip.setAttribute('aria-label', run.name);
  const title = el('strong', 'tour-tip__title');
  const text = el('p', 'tour-tip__text');
  text.setAttribute('aria-live', 'polite');
  const count = el('span', 'tour-tip__count');
  const skip = el('button', 'tour-tip__skip', steps.length > 1 ? 'Skip tour' : 'Close');
  skip.type = 'button';
  const next = el('button', 'btn btn--small tour-tip__next', 'Next');
  next.type = 'button';
  const actions = el('div', 'tour-tip__actions');
  actions.append(skip, next);
  const foot = el('div', 'tour-tip__foot');
  foot.append(count, actions);
  tip.append(title, text, foot);
  document.body.append(spot, tip);
  if (reduce) tip.classList.add('is-still');

  let at = 0;
  let node: HTMLElement = steps[0]!.node;
  let tapOff: (() => void) | null = null;

  const place = () => {
    const r = node.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, {
      top: `${r.top - pad}px`,
      left: `${r.left - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    const navH = document.querySelector<HTMLElement>('.app-nav')?.offsetHeight ?? 0;
    const room = innerHeight - navH;
    const h = tip.offsetHeight;
    const below = r.bottom + pad + GAP;
    const above = r.top - pad - GAP - h;
    // Below when it fits, else above, else over the bottom of the screen.
    const top = below + h <= room && below >= GAP ? below : above >= GAP ? above : Math.max(GAP, room - h - GAP);
    tip.style.top = `${top}px`;
  };

  const show = (i: number) => {
    at = i;
    tapOff?.();
    tapOff = null;
    const step = steps[i]!;
    node = step.node;
    title.textContent = step.title;
    text.textContent = step.text;
    count.textContent = steps.length > 1 ? `${i + 1} of ${steps.length}` : '';
    next.hidden = !!step.tap;
    next.textContent = i < steps.length - 1 ? 'Next' : run.sayWhere ? 'Done' : 'Got it';
    if (step.tap) tapOff = listen(node, 'click', () => setTimeout(finish, 0));
    node.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    place();
    // Smooth scrolling moves the target after this; place again once it settles.
    setTimeout(place, reduce ? 0 : 350);
    (step.tap ? skip : next).focus({ preventScroll: true });
  };

  const stop = () => {
    c.run();
    tapOff?.();
    spot.remove();
    tip.remove();
    if (stopCurrent === stop) stopCurrent = null;
  };

  /** The last word points at the ? button, so people know where the tour lives. */
  const finish = () => {
    tapOff?.();
    tapOff = null;
    const help = run.sayWhere ? visible('[data-guide-help]') : null;
    if (!help) return stop();
    node = help;
    title.textContent = 'Any time';
    text.textContent = 'Tap ? for this again, tips for this screen, and playbooks.';
    count.textContent = '';
    skip.hidden = true;
    next.hidden = false;
    next.textContent = 'Got it';
    at = steps.length;
    // The app's header scrolls away with the page; bring it back.
    help.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    place();
    next.focus({ preventScroll: true });
  };
  stopCurrent = stop;

  c.add(listen(next, 'click', () => (at >= steps.length ? stop() : at === steps.length - 1 ? finish() : show(at + 1))));
  c.add(listen(skip, 'click', stop));
  c.add(listen(document, 'keydown', (e) => e.key === 'Escape' && stop()));
  c.add(listen(window, 'resize', place));
  c.add(listen(window, 'scroll', place, { passive: true }));
  show(0);
  return true;
}
