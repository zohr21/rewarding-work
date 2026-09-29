/**
 * One small growing-plant glyph per tier (Seedling → Grove), as SVG markup
 * for innerHTML. Stroke-only, 24×24, coloured by `currentColor`.
 */
const PATHS = [
  // Seedling: two leaves on a short stem
  'M12 20v-6M12 14c-3.5 0-5.5-2-5.5-5 3.5 0 5.5 2 5.5 5zM12 14c3.5 0 5.5-2 5.5-5-3.5 0-5.5 2-5.5 5zM7 20h10',
  // Sprout: a taller stem with a leaf each side
  'M12 21V8M12 13c-3 0-5-1.5-5-4.5 3 0 5 1.5 5 4.5zM12 9.5c2.5 0 4.5-1.5 4.5-4.5-2.5 0-4.5 1.5-4.5 4.5zM7 21h10',
  // Sapling: a small round crown
  'M12 21v-8M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 16l-2.5-2M7 21h10',
  // Tree: a big crown and branches
  'M12 21v-7M12 17l3-3M12 15l-3-2.5M6 12a6 6 0 1 1 12 0c0 1.6-1.3 2.5-3 2.5H9c-1.7 0-3-.9-3-2.5zM6 21h12',
  // Grove: three trees
  'M12 21v-6M12 15a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 21v-4M5.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21v-4M18.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 21h18',
];

export function tierIcon(index: number, size = 24): string {
  const d = PATHS[Math.max(0, Math.min(PATHS.length - 1, index))];
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
