/**
 * Builds the file that is uploaded to Google Play (`npm run release`): the `play` version as a
 * signed app bundle (AAB), named after the version in package.json. Signing needs the upload key
 * (docs/release.md); without it the bundle is built unsigned and this says so.
 */
import { copyFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gradle, outputs, root } from './gradle.mjs';

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const props = process.env.GROVYN_KEYSTORE ?? join(homedir(), '.grovyn/keystore.properties');
let signed = false;
try {
  signed = /^\s*storeFile\s*=/m.test(readFileSync(props, 'utf8'));
} catch {
  /* No keystore.properties. */
}

// From scratch: Gradle has been seen packing the previous build's web files, and an upload must not.
gradle('bundlePlayRelease', '--rerun-tasks');

const copy = `grovyn-play-${version}.aab`;
copyFileSync(join(outputs, 'bundle/playRelease/app-play-release.aab'), join(root, copy));
console.log(`\nBundle built: ${copy} (version ${version})`);
if (!signed) console.log(`Not signed: no upload key at ${props}. Play won't take it; see docs/release.md.`);
