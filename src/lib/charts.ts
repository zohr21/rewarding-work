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

// ---------- Charts as SVG markup (progress page) ----------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** A row of small bars with no axis: `today` is solid, a zero is a stub on the baseline. */
export function miniBars(values: number[], today: number, label: string): string {
  const W = 200;
  const H = 34;
  const gap = 10;
  const bw = (W - gap * (values.length - 1)) / values.length;
  const max = Math.max(1, ...values);
  const bars = values
    .map((v, i) => {
      const x = r1(i * (bw + gap));
      if (v <= 0) return `<rect class="bar bar--none" x="${x}" y="${H - 3}" width="${r1(bw)}" height="3" rx="1.5" />`;
      const h = Math.max(4, Math.round((v / max) * H));
      return `<rect class="bar${i === today ? ' bar--today' : ''}" x="${x}" y="${H - h}" width="${r1(bw)}" height="${h}" rx="3" />`;
    })
    .join('');
  return `<svg class="mini" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${bars}</svg>`;
}

/** A trend line with a dot on the latest value. */
export function sparkline(values: number[], label: string): string {
  const W = 200;
  const H = 24;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [r1(4 + (i / Math.max(1, values.length - 1)) * (W - 8)), r1(H - 4 - (v / max) * (H - 8))] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const [ex, ey] = pts.at(-1) ?? [4, H - 4];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><path class="spark__line" d="${d}" /><circle class="spark__dot" cx="${ex}" cy="${ey}" r="3.5" /></svg>`;
}

export interface Slice {
  value: number;
  /** Colour slot 0–4 (.donut__s0 …), fixed per category so colours never swap. */
  slot: number;
}

/** A donut with two lines of text in the middle. Slices are drawn in the order given. */
export function donut(slices: Slice[], big: string, small: string, label: string): string {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  let at = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const pct = (s.value / total) * 100;
      // A hair of space between slices, unless there's only one.
      const len = Math.max(0.5, pct - (pct < 100 ? 1 : 0));
      const arc = `<circle class="donut__s${s.slot}" cx="60" cy="60" r="40" pathLength="100" stroke-dasharray="${r1(len)} ${r1(100 - len)}" stroke-dashoffset="${r1(-at)}" />`;
      at += pct;
      return arc;
    })
    .join('');
  return (
    `<svg class="donut" viewBox="0 0 120 120" role="img" aria-label="${esc(label)}">` +
    `<circle class="donut__track" cx="60" cy="60" r="40" /><g transform="rotate(-90 60 60)">${arcs}</g>` +
    `<text class="donut__big" x="60" y="${small ? 58 : 66}">${esc(big)}</text>` +
    (small ? `<text class="donut__small" x="60" y="75">${esc(small)}</text>` : '') +
    '</svg>'
  );
}

/** Legend marks differ in shape as well as colour. */
export function sliceMark(slot: number): string {
  const shapes = [
    '<circle cx="7" cy="7" r="6" />',
    '<rect x="1.5" y="1.5" width="11" height="11" rx="2" />',
    '<path d="M7 0.5l6.5 6.5L7 13.5 0.5 7z" />',
    '<path d="M7 1l6.5 12h-13z" />',
    '<rect x="1" y="4" width="12" height="6" rx="3" />',
  ];
  return `<svg class="donut__mark donut__s${slot}" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">${shapes[slot] ?? shapes[4]}</svg>`;
}
