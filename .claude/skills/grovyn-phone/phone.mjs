/**
 * Runs a JavaScript expression inside the Grovyn app's web view on the phone and prints the
 * result as JSON, over adb + Chrome DevTools Protocol. Needs Node 22+ (global WebSocket/fetch)
 * and the app open on the phone (a debug build, so its web view can be inspected).
 *
 *   node .claude/skills/grovyn-phone/phone.mjs "location.href"
 *   node .claude/skills/grovyn-phone/phone.mjs "Object.keys(localStorage)"
 *   node .claude/skills/grovyn-phone/phone.mjs --pkg app.grovyn "localStorage['rw:v1:body']"
 *   node .claude/skills/grovyn-phone/phone.mjs "await Capacitor.Plugins.RewardDevice.usageState()"
 *
 * Options: --serial <adb id> (default: the phone's IP:port entry, since it shows up twice),
 * --pkg <package> (default app.grovyn.full, what `npm run apk` installs), --port <local port>.
 * Reading is fine; anything that writes to the user's real data needs their OK first.
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const [, value] = args.splice(i, 2);
  return value;
};
let serial = opt('serial', '');
const pkg = opt('pkg', 'app.grovyn.full');
const port = opt('port', '9333');
const expression = args.join(' ');
if (!expression) {
  console.error('Usage: node phone.mjs [--serial ID] [--pkg PACKAGE] "<expression>"');
  process.exit(2);
}

const adb = (...a) => execFileSync('adb', serial ? ['-s', serial, ...a] : a, { encoding: 'utf8' }).trim();

if (!serial) {
  const devices = adb('devices')
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t'))
    .filter(([, state]) => state?.trim() === 'device')
    .map(([id]) => id);
  if (!devices.length) throw new Error('No phone in `adb devices`. Connect it (USB or wireless debugging) first.');
  serial = devices.find((id) => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(id)) ?? devices[0];
}

let pid = '';
try {
  pid = adb('shell', 'pidof', pkg);
} catch {}
if (!pid) throw new Error(`${pkg} isn't running on ${serial}. Open the app on the phone and try again.`);
pid = pid.split(/\s+/)[0];

adb('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
try {
  // A backgrounded app is frozen by Android: its socket accepts but never answers.
  const asleep = 'The app is not answering. Unlock the phone and bring Grovyn to the front, then try again.';
  const pages = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(8000) })
    .then((r) => r.json())
    .catch(() => {
      throw new Error(asleep);
    });
  const page = pages.find((p) => p.type === 'page' && p.url.startsWith('https://localhost')) ?? pages.find((p) => p.type === 'page');
  if (!page) throw new Error('The app has no inspectable page right now.');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No answer from the web view in 15 s.')), 15000);
    ws.onerror = () => reject(new Error('Could not connect to the web view.'));
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, replMode: true } }));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== 1) return;
      clearTimeout(timer);
      resolve(msg.result);
    };
  });
  ws.close();

  if (result.exceptionDetails) {
    console.error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    process.exitCode = 1;
  } else {
    const value = result.result.value;
    console.log(typeof value === 'string' ? value : JSON.stringify(value ?? result.result.description ?? null, null, 2));
  }
} finally {
  adb('forward', '--remove', `tcp:${port}`);
}
