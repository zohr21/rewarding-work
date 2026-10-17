/**
 * Draws the app icons in public/icons from the Grovyn mark.
 *
 *   node scripts/make-icons.mjs
 *
 * public/favicon.svg and src/components/BrandMark.astro draw the same shapes.
 * Change the mark in all three places together.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const MARK = `
  <g fill="#8fe0ae">
    <rect x="14" y="38" width="4" height="16" rx="2"/>
    <circle cx="16" cy="35" r="6.5"/>
    <rect x="30" y="30" width="4" height="24" rx="2"/>
    <circle cx="32" cy="25" r="9"/>
    <rect x="46" y="23" width="4" height="31" rx="2"/>
    <circle cx="48" cy="17" r="7.5"/>
  </g>
  <circle cx="48" cy="17" r="2.75" fill="#f2c14e"/>`;

/** A moss tile with the mark centred; `mark` is the mark's share of the width, `radius` the tile's. */
function icon(size, mark, radius) {
  const scale = (size * mark) / 64;
  const offset = (size - 64 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="#1a2620"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${MARK}</g>
</svg>`;
}

const ICONS = [
  ['icon-192.png', 192, 0.8, 0.22],
  ['icon-512.png', 512, 0.8, 0.22],
  // Maskable: full bleed, mark inside the 80% safe zone.
  ['maskable-512.png', 512, 0.62, 0],
  // iOS rounds the corners itself.
  ['apple-touch-icon.png', 180, 0.78, 0],
];

mkdirSync('public/icons', { recursive: true });
for (const [name, size, mark, radius] of ICONS) {
  await sharp(Buffer.from(icon(size, mark, radius))).png().toFile(`public/icons/${name}`);
  console.log(`public/icons/${name}`);
}
