/**
 * Small inline graphics for the tasks page: the progress ring and the step segments.
 * Styled by .ring / .segs in src/styles/global.css, so they follow the theme.
 *
 * A graphic without a label is decorative (aria-hidden): use that when the same
 * numbers sit next to it as text.
 */

const CHECK = '<path class="ring__mark" d="M21 33l8 8 15-17" />';
const PLUS = '<path class="ring__mark" d="M32 23v18M23 32h18" />';

/**
 * Progress ring. Four states: no steps yet (dashed, with a plus), none done,
 * some done (the arc), all done (filled, with a tick).
 */
export function ring(done: number, total: number, size: number, label?: string): SVGSVGElement {
  let state = 'part';
  let inner: string;
  if (total <= 0) {
    state = 'empty';
    inner = `<circle class="ring__dash" cx="32" cy="32" r="26" />${PLUS}`;
  } else if (done >= total) {
    state = 'full';
    inner = `<circle class="ring__disc" cx="32" cy="32" r="29.5" />${CHECK}`;
  } else {
    const text = `${done}/${total}`;
    const pct = Math.round((done / total) * 100);
    inner =
      '<circle class="ring__track" cx="32" cy="32" r="26" />' +
      // No arc at zero: a round line cap would still draw a dot.
      (done > 0 ? `<circle class="ring__value" cx="32" cy="32" r="26" pathLength="100" stroke-dasharray="${pct} 100" transform="rotate(-90 32 32)" />` : '') +
      `<text class="ring__text" x="32" y="${text.length > 4 ? 36 : 38}" font-size="${text.length > 4 ? 12 : 17}">${text}</text>`;
  }
  const t = document.createElement('template');
  t.innerHTML = `<svg class="ring ring--${state}" viewBox="0 0 64 64" width="${size}" height="${size}">${inner}</svg>`;
  const svg = t.content.firstElementChild as SVGSVGElement;
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  return svg;
}

/** One segment per step, in order; done ones are filled. */
export function segments(steps: { done: boolean }[]): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'segs';
  row.setAttribute('aria-hidden', 'true');
  for (const s of steps) {
    const seg = document.createElement('span');
    if (s.done) seg.className = 'is-done';
    row.append(seg);
  }
  return row;
}
