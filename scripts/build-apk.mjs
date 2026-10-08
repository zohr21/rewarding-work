/**
 * Builds the Android app file (APK) from android/ and, if a phone is connected with
 * USB debugging on, installs it (`npm run apk`, after `npm run build:app`).
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
  built = spawnSync(win ? '.\\gradlew.bat' : './gradlew', ['assembleDebug', '--console=plain', '-q'], {
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
const apk = join(homedir(), '.cache/rewarding-work-android/app/outputs/apk/debug/app-debug.apk');
// A copy in the project folder, easy to find and send to a phone.
copyFileSync(apk, join(root, 'rewarding-work.apk'));
console.log('\nApp built: rewarding-work.apk');

const devices = spawnSync('adb', ['devices'], { encoding: 'utf8', shell: win }).stdout ?? '';
if (/\tdevice/.test(devices)) {
  spawnSync('adb', ['install', '-r', apk], { stdio: 'inherit', shell: win });
} else {
  console.log('No phone connected, so nothing was installed. Connect it with USB debugging on and run this again.');
}
