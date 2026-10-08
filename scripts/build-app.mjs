/**
 * Builds the site for the Android app and copies it into android/ (`npm run build:app`).
 * Same as `npm run build`, but served from the root of the app instead of /<repo>/ and
 * with PUBLIC_NATIVE_APP set (see src/config/app.ts).
 */
import { execSync } from 'node:child_process';

const env = { ...process.env, BASE_PATH: '/', PUBLIC_NATIVE_APP: 'true' };
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });

run('npx astro check');
run('npx astro build');
run('npx cap sync android');
