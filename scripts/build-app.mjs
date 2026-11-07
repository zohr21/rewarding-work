/**
 * Builds the site for the Android app and copies it into android/ (`npm run build:app`).
 * Same as `npm run build`, but served from the root of the app instead of /<repo>/ and
 * with PUBLIC_NATIVE_APP set (see src/config/app.ts).
 *
 * `node scripts/build-app.mjs play` (`npm run apk:play`, `npm run release`) also sets
 * PUBLIC_PLAY_STORE, for what the Google Play version leaves out.
 */
import { execSync } from 'node:child_process';
import { loadEnv } from 'vite';

const play = process.argv[2] === 'play';
const env = { ...process.env, BASE_PATH: '/', PUBLIC_NATIVE_APP: 'true', PUBLIC_PLAY_STORE: play ? 'true' : 'false' };
// The Play version must ship with accounts: without the Firebase settings (.env) the You page
// has no sign-in and no in-app account deletion, which Play requires. A worktree has no .env
// of its own, so this catches building from one by mistake.
if (play) {
  const vars = loadEnv('production', process.cwd(), 'PUBLIC_');
  const need = ['PUBLIC_FIREBASE_API_KEY', 'PUBLIC_FIREBASE_AUTH_DOMAIN', 'PUBLIC_FIREBASE_PROJECT_ID', 'PUBLIC_FIREBASE_APP_ID'];
  const missing = need.filter((k) => !(process.env[k] ?? vars[k]));
  if (missing.length) {
    console.error(`
The Play version needs the Firebase settings, and these are missing: ${missing.join(', ')}.
Copy .env from the main checkout (see .env.example), then build again.
`);
    process.exit(1);
  }
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });

run('npx astro check');
run('npx astro build');
run('npx cap sync android');
