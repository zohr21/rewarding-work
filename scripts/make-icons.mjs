/**
 * Draws the app icons in public/icons from the coin mark.
 *
 *   node scripts/make-icons.mjs
 *
 * The coin here is the full cut (inner ring, lighter check); public/favicon.svg and the
 * header use the same shapes. Change the mark in all three places together.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const COIN = `
  <path d="M6 29a26 26 0 0 1 52 0v6a26 26 0 0 1-52 0z" fill="#2e7a50"/>
  <circle cx="32" cy="29" r="26" fill="#84dba6"/>
  <circle cx="32" cy="29" r="24.75" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="1.5"/>
  <circle cx="32" cy="29" r="19.5" fill="none" stroke="#0b3a22" stroke-opacity="0.22" stroke-width="1.5"/>
  <path d="M21.5 29.5l7.5 7.5 14-15.5" fill="none" stroke="#07170f" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A night tile with the coin centred; `coin` is the coin's share of the width, `radius` the tile's. */
function icon(size, coin, radius) {
  const scale = (size * coin) / 64;
  const offset = (size - 64 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="#16211b"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${COIN}</g>
</svg>`;
}

const ICONS = [
  ['icon-192.png', 192, 0.66, 0.22],
  ['icon-512.png', 512, 0.66, 0.22],
  // Maskable: full bleed, coin inside the 80% safe zone.
  ['maskable-512.png', 512, 0.56, 0],
  // iOS rounds the corners itself.
  ['apple-touch-icon.png', 180, 0.64, 0],
];

mkdirSync('public/icons', { recursive: true });
for (const [name, size, coin, radius] of ICONS) {
  await sharp(Buffer.from(icon(size, coin, radius))).png().toFile(`public/icons/${name}`);
  console.log(`public/icons/${name}`);
}
