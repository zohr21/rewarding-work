/**
 * Builds the Android app file (APK) from android/ and, if a phone is connected with
 * USB debugging on, installs it (`npm run apk`, after `npm run build:app`).
 *
 * Which version is the first argument (android/app/build.gradle, productFlavors):
 * `full` (the default, `npm run apk`) also reads past bank SMS and is installed by hand;
 * `play` (`npm run apk:play`) is the one for Google Play. They install side by side.
 * For the file that goes to Play, see build-release.mjs.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { gradle, outputs, root, win } from './gradle.mjs';

const flavor = process.argv[2] ?? 'full';
if (!['full', 'play'].includes(flavor)) throw new Error(`Unknown version "${flavor}": use full or play.`);
const Flavor = flavor[0].toUpperCase() + flavor.slice(1);

gradle(`assemble${Flavor}Debug`);

const apk = join(outputs, `apk/${flavor}/debug/app-${flavor}-debug.apk`);
// A copy in the project folder, easy to find and send to a phone.
const copy = flavor === 'full' ? 'grovyn.apk' : `grovyn-${flavor}.apk`;
copyFileSync(apk, join(root, copy));
console.log(`\nApp built: ${copy}`);

const devices = spawnSync('adb', ['devices'], { encoding: 'utf8', shell: win }).stdout ?? '';
if (/\tdevice/.test(devices)) {
  spawnSync('adb', ['install', '-r', apk], { stdio: 'inherit', shell: win });
} else {
  console.log('No phone connected, so nothing was installed. Connect it with USB debugging on and run this again.');
}
