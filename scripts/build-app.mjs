/**
 * Builds the site for the Android app and copies it into android/ (`npm run build:app`).
 * Same as `npm run build`, but served from the root of the app instead of /<repo>/ and
 * with PUBLIC_NATIVE_APP set (see src/config/app.ts).
 *
 * `node scripts/build-app.mjs play` (`npm run apk:play`, `npm run release`) also sets
 * PUBLIC_PLAY_STORE, for what the Google Play version leaves out.
 */
import { execSync } from 'node:child_process';

const play = process.argv[2] === 'play';
const env = { ...process.env, BASE_PATH: '/', PUBLIC_NATIVE_APP: 'true', PUBLIC_PLAY_STORE: play ? 'true' : 'false' };
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });

run('npx astro check');
run('npx astro build');
run('npx cap sync android');
