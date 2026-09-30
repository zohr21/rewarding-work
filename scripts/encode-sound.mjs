/**
 * Turns a field recording into a background-sound file for public/sounds.
 *
 *   node scripts/encode-sound.mjs <input.wav> <name> [start seconds] [length seconds] [--declip]
 *   node scripts/encode-sound.mjs ~/Downloads/396578__chromakei__rainfall.wav rain 30 120
 *
 * Cuts `length` seconds (default 120) from `start` (default 0) and writes
 * public/sounds/<name>.m4a: AAC, 192 kbps stereo, 48 kHz, normalised to -20 LUFS (EBU R128
 * loudness, so the sounds feel equally loud) with peaks kept under -1.5 dB. Pick a steady stretch with no
 * bumps or passing cars: the player loops it with a 3 s cross-fade, levels it and adds
 * the 3D details (src/lib/sound). --declip repairs clipped peaks (slow; use it only if the
 * recording clips). Add the source to public/sounds/CREDITS.md, and bump
 * SOUNDS in pwa/sw.template.js when replacing a file, so visitors get the new one.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';

const args = process.argv.slice(2);
const declip = args.includes('--declip');
const [input, name, start = '0', length = '120'] = args.filter((a) => a !== '--declip');
if (!input || !name) {
  console.error('Usage: node scripts/encode-sound.mjs <input> <name> [start] [length]');
  process.exit(1);
}

const LOUDNESS = 'I=-20:TP=-1.5:LRA=11';
const cut = ['-hide_banner', '-ss', start, '-t', length, '-i', input];
const before = declip ? ['adeclip'] : [];

// Two passes: measure, then normalise with the measured values, which keeps it a plain
// gain change (no pumping) wherever the peak limit allows.
const measure = spawnSync(ffmpeg, [...cut, '-af', [...before, `loudnorm=${LOUDNESS}:print_format=json`].join(','), '-f', 'null', '-'], {
  encoding: 'utf8',
});
const json = measure.stderr.slice(measure.stderr.lastIndexOf('{'));
if (measure.status !== 0 || !json.includes('input_i')) {
  console.error(measure.stderr);
  process.exit(1);
}
const m = JSON.parse(json);
const norm = `loudnorm=${LOUDNESS}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`;

mkdirSync('public/sounds', { recursive: true });
const out = `public/sounds/${name}.m4a`;
const run = spawnSync(
  ffmpeg,
  [...cut, '-y', '-af', [...before, norm].join(','), '-map_metadata', '-1', '-ac', '2', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out],
  { stdio: 'inherit' },
);
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`Wrote ${out} (was ${m.input_i} LUFS, peak ${m.input_tp} dB)`);
