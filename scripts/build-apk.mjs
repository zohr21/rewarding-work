/**
 * Builds the Android app file (APK) from android/ and, if a phone is connected with
 * USB debugging on, installs it (`npm run apk`, after `npm run build:app`).
 *
 * Which version is the first argument (android/app/build.gradle, productFlavors):
 * `full` (the default, `npm run apk`) also reads past bank SMS and is installed by hand;
 * `play` (`npm run apk:play`) is the one for Google Play. They install side by side.
 *
 * Works around two Windows problems: Gradle can't run from a folder with non-Latin
 * characters in its path (the project is mapped to a spare drive letter while it runs),
 * and Java is usually only installed as part of Android Studio.
 */
import { execSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const flavor = process.argv[2] ?? 'full';
if (!['full', 'play'].includes(flavor)) throw new Error(`Unknown version "${flavor}": use full or play.`);
const Flavor = flavor[0].toUpperCase() + flavor.slice(1);

const win = process.platform === 'win32';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const env = { ...process.env };

const studioJava = 'C:\\Program Files\\Android\\Android Studio\\jbr';
if (!env.JAVA_HOME && win && existsSync(studioJava)) env.JAVA_HOME = studioJava;

let dir = root;
let drive = null;
if (win && /[^\x20-\x7e]/.test(root)) {
  drive = [...'RSTUVWXYZ'].map((l) => `${l}:`).find((d) => !existsSync(`${d}\\`));
  if (!drive) throw new Error('No spare drive letter to build from. Move the project to a folder with a plain Latin path.');
  execSync(`subst ${drive} "${root}"`);
  dir = `${drive}\\`;
}

let built;
try {
  built = spawnSync(win ? '.\\gradlew.bat' : './gradlew', [`assemble${Flavor}Debug`, '--console=plain', '-q'], {
    cwd: join(dir, 'android'),
    env,
    stdio: 'inherit',
    shell: win,
  });
} finally {
  if (drive) execSync(`subst ${drive} /d`);
}
if (built.status !== 0) process.exit(built.status ?? 1);

// Same place as layout.buildDirectory in android/build.gradle.
const apk = join(homedir(), `.cache/grovyn-android/app/outputs/apk/${flavor}/debug/app-${flavor}-debug.apk`);
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
