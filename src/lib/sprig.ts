/**
 * Sprig, Grovyn's mascot: a little round tree whose stage follows the focus-time tier
 * (src/lib/rewards.ts). Stage 0 is a seed with no leaf yet; stages 1–5 are Seedling,
 * Sprout, Sapling, Tree and Grove, and the leaf on top is that tier's metal. The face
 * stays the same at every stage; a mood changes only the eyes, mouth and cheeks.
 *
 * Pure SVG markup, so the same drawing works in .astro (set:html) and in scripts
 * (innerHTML). Design canvas: https://claude.ai/artifact/5Vu4gAmsEq768cD9tsN6Yf
 */
import { TIER_NAMES, TRACKS, trackProgress } from './rewards';
import type { FocusSession } from './storage';

export const SPRIG_MOODS = ['happy', 'cheer', 'focus', 'curious', 'gentle', 'sleepy'] as const;
export type SprigMood = (typeof SPRIG_MOODS)[number];

export interface SprigOptions {
  /** 0 (seed) to 5 (Grove). */
  stage: number;
  mood?: SprigMood;
  /** Width of Sprig's own tree in px (the Grove's friends add to it); the height follows the stage. */
  size?: number;
  /** 0–3 buds in the next stage's colour, showing how far along to it Sprig is. */
  buds?: number;
  /** Accessible name. Without one the drawing is decoration (aria-hidden). */
  label?: string;
}

const BODY = '#8fe0ae';
const EDGE = '#3f8a63';
const FACE = '#1b2b22';
const BARK = '#6b5038';
const BARK_HI = '#8a6a4a';

interface Stage {
  cy: number;
  s: number;
  trunk: number;
  leaves: 0 | 1 | 2;
  crown: boolean;
  leafY: number;
  leafRot: number;
  fill: string;
  edge: string;
  shadow: number;
}

/** Leaf colours follow --tier-0…4 in tokens.css (green, bronze, silver, gold, diamond). */
const STAGES: Stage[] = [
  { cy: 158, s: 0.7, trunk: 0, leaves: 0, crown: false, leafY: -36, leafRot: 0, fill: BODY, edge: EDGE, shadow: 42 },
  { cy: 152, s: 0.78, trunk: 0, leaves: 1, crown: false, leafY: -36, leafRot: 12, fill: BODY, edge: EDGE, shadow: 46 },
  { cy: 146, s: 0.88, trunk: 0, leaves: 2, crown: false, leafY: -36, leafRot: 30, fill: '#d68f55', edge: '#8f5428', shadow: 50 },
  { cy: 118, s: 0.96, trunk: 15, leaves: 2, crown: false, leafY: -36, leafRot: 30, fill: '#dfe5ea', edge: '#8794a0', shadow: 44 },
  { cy: 104, s: 1.08, trunk: 19, leaves: 1, crown: true, leafY: -58, leafRot: 18, fill: '#f2c14e', edge: '#a87a1e', shadow: 66 },
  { cy: 104, s: 1.08, trunk: 19, leaves: 1, crown: true, leafY: -58, leafRot: 18, fill: '#bfeaff', edge: '#4f9cc6', shadow: 100 },
];

/** Top of each stage's drawing (leaf tip, crown or sparkle) with a little room, and the ground's bottom. */
const TOPS = [116, 88, 74, 40, -8, -16];
const BOTTOM = 206;

interface Mood {
  eyes: 'dot' | 'arc';
  l?: string;
  r?: string;
  look?: [number, number];
  brows?: boolean;
  mouth: string;
  open?: boolean;
  blush: number;
  zz?: boolean;
}

const MOODS: Record<SprigMood, Mood> = {
  happy: { eyes: 'dot', mouth: 'M-7 9 Q0 17 7 9', blush: 0.55 },
  cheer: { eyes: 'arc', l: 'M-19 1 Q-14 -7 -9 1', r: 'M9 1 Q14 -7 19 1', mouth: 'M-9 7 Q0 24 9 7 Z', open: true, blush: 0.85 },
  focus: { eyes: 'arc', l: 'M-19 -1 Q-14 4 -9 -1', r: 'M9 -1 Q14 4 19 -1', mouth: 'M-4 11 Q0 13 4 11', blush: 0.4 },
  curious: { eyes: 'dot', look: [2.5, -2], mouth: 'M-3 12 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0', open: true, blush: 0.5 },
  gentle: { eyes: 'dot', brows: true, mouth: 'M-5 11 Q0 14 5 11', blush: 0.5 },
  sleepy: { eyes: 'arc', l: 'M-19 1 L-9 1', r: 'M9 1 L19 1', mouth: 'M-2.5 12 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0', open: true, blush: 0.3, zz: true },
};

/** Where buds sit on the round head, and on the leafy crown (head coordinates, in the order they appear). */
const BUDS_BODY: [number, number][] = [[-27, -22], [27, -24], [-14, -33]];
const BUDS_CROWN: [number, number][] = [[-38, -24], [36, -30], [-12, -54]];
/** Buds for a green Seedling leaf, lighter than the body so they show. */
const BUD_GREEN = '#d7f7e2';

const LEAF ='M0 2 C-13 -6 -14 -24 0 -36 C14 -24 13 -6 0 2 Z';
const SPARKLE = 'M0 -10 Q1.6 -1.6 10 0 Q1.6 1.6 0 10 Q-1.6 1.6 -10 0 Q-1.6 -1.6 0 -10 Z';

const leaf = (rot: number, fill: string, edge: string, scale = 1) =>
  `<g transform="rotate(${rot}) scale(${scale})"><path d="${LEAF}" fill="${fill}" stroke="${edge}" stroke-width="2.5" stroke-linejoin="round"/><path d="M0 -2 L0 -26" stroke="${edge}" stroke-width="2" stroke-linecap="round" opacity="0.7"/></g>`;

/** A friend tree beside Sprig at the Grove stage, asleep. */
const friend = (x: number, cy: number, r: number) =>
  `<rect x="${x - 5.5}" y="${cy + 8}" width="11" height="${196 - cy - 8}" rx="5.5" fill="${BARK}"/>` +
  `<circle cx="${x}" cy="${cy + 3}" r="${r}" fill="#3f8a63"/><circle cx="${x}" cy="${cy}" r="${r}" fill="#5fbf8a"/>` +
  `<path d="M${x - 9.5} ${cy + 1} q3 3.5 6 0 M${x + 3.5} ${cy + 1} q3 3.5 6 0" stroke="${FACE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;

/** Sprig as SVG markup. */
export function sprigSvg({ stage, mood = 'happy', size = 120, buds = 0, label }: SprigOptions): string {
  const n = Math.max(0, Math.min(5, Math.round(stage)));
  const st = STAGES[n]!;
  const md = MOODS[mood] ?? MOODS.happy;
  const parts: string[] = [];

  parts.push(`<ellipse cx="120" cy="197" rx="${st.shadow}" ry="7" fill="#000" opacity="0.28"/>`);
  if (n === 5) parts.push(friend(51.5, 140, 23), friend(191, 122, 28));
  if (!st.trunk) {
    parts.push(`<ellipse cx="120" cy="191" rx="48" ry="12" fill="#3b2c20"/><ellipse cx="120" cy="188" rx="41" ry="8" fill="#55412f"/>`);
  } else {
    const y = st.cy + 40 * st.s - 12;
    parts.push(
      `<rect x="${120 - st.trunk / 2}" y="${y}" width="${st.trunk}" height="${196 - y}" rx="7" fill="${BARK}"/>`,
      `<rect x="${120 - st.trunk / 2}" y="${y}" width="${st.trunk - 6}" height="${196 - y}" rx="6" fill="${BARK_HI}"/>`,
    );
  }

  // The head: leaves behind, then the crown and body with a solid lower edge, then the face.
  const head: string[] = [];
  const leaves: string[] = [];
  if (st.leaves === 2) leaves.push(leaf(-40, BODY, EDGE, 0.9));
  if (st.leaves) leaves.push(leaf(st.leafRot, st.fill, st.edge));
  if (leaves.length) head.push(`<g transform="translate(0 ${st.leafY})">${leaves.join('')}</g>`);
  const crown = (dy: number, fill: string) =>
    `<g fill="${fill}"><circle cx="-33" cy="${-10 - dy}" r="25"/><circle cx="33" cy="${-12 - dy}" r="26"/><circle cx="0" cy="${-30 - dy}" r="29"/></g>`;
  if (st.crown) head.push(crown(0, EDGE));
  head.push(`<circle cx="0" cy="4" r="40" fill="${EDGE}"/>`);
  if (st.crown) head.push(crown(4, BODY));
  head.push(
    `<circle cx="0" cy="0" r="40" fill="${BODY}"/>`,
    `<ellipse cx="-14" cy="-20" rx="13" ry="7" fill="#fff" opacity="0.32" transform="rotate(-22 -14 -20)"/>`,
  );
  // Buds in the next stage's colour: one for each quarter of the way there.
  if (n < 5 && buds > 0) {
    const next = STAGES[n + 1]!;
    const [fill, edge] = next.fill === BODY ? [BUD_GREEN, EDGE] : [next.fill, next.edge];
    for (const [x, y] of (st.crown ? BUDS_CROWN : BUDS_BODY).slice(0, Math.min(3, buds))) {
      head.push(
        `<circle cx="${x}" cy="${y}" r="7" fill="${fill}" stroke="${edge}" stroke-width="2.4"/>`,
        `<circle cx="${x - 2}" cy="${y - 2}" r="2" fill="#fff" opacity="0.75"/>`,
      );
    }
  }
  head.push(
    `<ellipse cx="-25" cy="10" rx="6.5" ry="3.8" fill="#f29a8e" opacity="${md.blush}"/>`,
    `<ellipse cx="25" cy="10" rx="6.5" ry="3.8" fill="#f29a8e" opacity="${md.blush}"/>`,
  );
  if (md.brows) {
    head.push(`<path d="M-20 -10 L-10 -14 M10 -14 L20 -10" stroke="${FACE}" stroke-width="2.4" stroke-linecap="round"/>`);
  }
  if (md.eyes === 'dot') {
    const [x, y] = md.look ?? [0, 0];
    head.push(
      `<g transform="translate(${x} ${y})"><ellipse cx="-14" cy="-1" rx="4.8" ry="6.2" fill="${FACE}"/><ellipse cx="14" cy="-1" rx="4.8" ry="6.2" fill="${FACE}"/>` +
        `<circle cx="-12.4" cy="-3.6" r="1.7" fill="#fff"/><circle cx="15.6" cy="-3.6" r="1.7" fill="#fff"/></g>`,
    );
  } else {
    head.push(`<path d="${md.l} ${md.r}" stroke="${FACE}" stroke-width="3" fill="none" stroke-linecap="round"/>`);
  }
  head.push(
    `<path d="${md.mouth}" fill="${md.open ? FACE : 'none'}" stroke="${FACE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  parts.push(`<g class="sprig__head" transform="translate(120 ${st.cy}) scale(${st.s})">${head.join('')}</g>`);

  if (n === 5) {
    parts.push(
      `<g fill="#e6f7ff"><path transform="translate(166 8)" d="${SPARKLE}"/><path transform="translate(70 26) scale(0.6)" d="${SPARKLE}"/></g>`,
    );
  }
  if (md.zz) {
    const top = st.cy - (st.crown ? 64 : 40) * st.s;
    parts.push(
      `<g class="sprig__zz" fill="currentColor" font-family="var(--font-display, sans-serif)" font-weight="700">` +
        `<text x="${120 + 44 * st.s}" y="${top + 8}" font-size="18">z</text><text x="${120 + 58 * st.s}" y="${top - 8}" font-size="13">z</text></g>`,
    );
  }

  // Cropped to the stage's own outline: a seed is short and a Tree tall at the same width,
  // and only the Grove, with its two friends, is drawn wide.
  const top = TOPS[n]! - (md.zz ? 26 : 0);
  const [left, width] = n === 5 ? [0, 240] : [48, 144];
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  // `size` is the width of one tree, so Sprig's face stays the same size when the friends arrive.
  const scale = size / 144;
  return `<svg class="sprig__art" viewBox="${left} ${top} ${width} ${BOTTOM - top}" width="${Math.round(width * scale)}" height="${Math.round((BOTTOM - top) * scale)}" ${a11y}>${parts.join('')}</svg>`;
}

export interface SprigGrowth {
  /** How many focus-time tiers are reached (0 = still a seed). */
  stage: number;
  /** How far from this stage to the next, 0–1 (1 once Sprig is a Grove). */
  share: number;
  /** Buds to draw: one per quarter of the way to the next stage. */
  buds: number;
}

/** Sprig's stage and how far along to the next one, from focus time. */
export function sprigGrowth(sessions: FocusSession[]): SprigGrowth {
  const p = trackProgress({ sessions, done: [], chainDays: [] }, TRACKS[0]!);
  const next = p.track.thresholds[p.level];
  if (next === undefined) return { stage: p.level, share: 1, buds: 0 };
  const prev = p.level ? p.track.thresholds[p.level - 1]! : 0;
  const share = Math.min(1, Math.max(0, (p.value - prev) / (next - prev)));
  return { stage: p.level, share, buds: Math.min(3, Math.floor(share * 4)) };
}

/** Sprig's stage: how many focus-time tiers are reached (0 = still a seed). */
export function sprigStage(sessions: FocusSession[]): number {
  return sprigGrowth(sessions).stage;
}

const HOUR = 3_600_000;

/**
 * How Sprig feels when nothing else is going on: cheering for an hour after a session,
 * gentle after two days or more without one, sleepy late at night, otherwise `rest`.
 */
export function sprigMood(sessions: FocusSession[], rest: SprigMood = 'happy', now = Date.now()): SprigMood {
  const last = sessions.reduce((max, s) => Math.max(max, s.end), 0);
  if (!last) return rest;
  if (now - last < HOUR) return 'cheer';
  if (now - last > 48 * HOUR) return 'gentle';
  const hour = new Date(now).getHours();
  if (hour >= 23 || hour < 5) return 'sleepy';
  return rest;
}

/** "a seed", "a Sapling" — what Sprig is at a stage, for sentences. */
export function sprigStageName(stage: number): string {
  return stage <= 0 ? 'a seed' : `a ${TIER_NAMES[Math.min(5, stage) - 1]}`;
}

/** Redraw a [data-sprig] element after its stage, buds or mood changed. */
export function paintSprig(host: HTMLElement, change: { stage?: number; buds?: number; mood?: SprigMood } = {}): void {
  if (change.stage !== undefined) host.dataset.stage = String(change.stage);
  if (change.buds !== undefined) host.dataset.buds = String(change.buds);
  if (change.mood) host.dataset.mood = change.mood;
  const stage = Number(host.dataset.stage) || 0;
  const buds = Number(host.dataset.buds) || 0;
  const mood = (host.dataset.mood as SprigMood) || 'happy';
  const key = `${stage}:${buds}:${mood}`;
  if (host.dataset.drawn === key) return;
  host.dataset.drawn = key;
  host.innerHTML = sprigSvg({ stage, buds, mood, size: Number(host.dataset.size) || 120 });
}
