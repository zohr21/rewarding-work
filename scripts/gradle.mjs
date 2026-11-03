/**
 * Runs Gradle in android/ (build-apk.mjs, build-release.mjs).
 *
 * Works around two Windows problems: Gradle can't run from a folder with non-Latin
 * characters in its path (the project is mapped to a spare drive letter while it runs),
 * and Java is usually only installed as part of Android Studio.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const win = process.platform === 'win32';
export const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
/** Same place as layout.buildDirectory in android/build.gradle. */
export const outputs = join(homedir(), '.cache/grovyn-android/app/outputs');

/** Runs the Gradle tasks; exits the script if they fail. */
export function gradle(...tasks) {
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
    built = spawnSync(win ? '.\\gradlew.bat' : './gradlew', [...tasks, '--console=plain', '-q'], {
      cwd: join(dir, 'android'),
      env,
      stdio: 'inherit',
      shell: win,
    });
  } finally {
    if (drive) execSync(`subst ${drive} /d`);
  }
  if (built.status !== 0) process.exit(built.status ?? 1);
}
