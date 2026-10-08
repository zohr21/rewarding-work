/**
 * Makes the Android launcher icons and splash screens from the site's icons
 * (public/icons). Run again after changing the logo: `node scripts/app-icons.mjs`.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const res = join(root, 'android/app/src/main/res');
const icon = join(root, 'public/icons/icon-512.png');
const maskable = join(root, 'public/icons/maskable-512.png');

// The maskable icon's own background, so the splash screen matches it exactly.
const { data } = await sharp(maskable).raw().toBuffer({ resolveWithObject: true });
const background = { r: data[0], g: data[1], b: data[2], alpha: 1 };

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, scale] of Object.entries(DENSITIES)) {
  const dir = join(res, `mipmap-${name}`);
  await sharp(icon).resize(48 * scale).toFile(join(dir, 'ic_launcher.png'));
  await sharp(icon).resize(48 * scale).toFile(join(dir, 'ic_launcher_round.png'));
  await sharp(maskable).resize(108 * scale).toFile(join(dir, 'ic_launcher_foreground.png'));
}

for (const dir of (await readdir(res)).filter((d) => d.startsWith('drawable'))) {
  const file = join(res, dir, 'splash.png');
  const meta = await sharp(file).metadata().catch(() => null);
  if (!meta) continue;
  const size = Math.round(Math.min(meta.width, meta.height) * 0.6);
  const logo = await sharp(maskable).resize(size).toBuffer();
  const splash = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background } })
    .composite([{ input: logo }])
    .png()
    .toBuffer();
  await writeFile(file, splash);
}

const hex = '#' + [background.r, background.g, background.b].map((v) => v.toString(16).padStart(2, '0')).join('');
console.log(`Icons and splash screens written (background ${hex}).`);
