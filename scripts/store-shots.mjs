/**
 * Google Play screenshots and feature graphic (docs/store/). Phone shots are 360x640 CSS px
 * at 3x = 1080x1920, with sample data seeded into localStorage, from the Play version.
 *
 *   1. Start the Play preview (needs .env for accounts), in cmd:
 *      set PUBLIC_PLAY_STORE=true&& npx astro dev --mode app --port 4414
 *   2. node scripts/store-shots.mjs            (defaults: http://localhost:4414, docs/store)
 *
 * Uses the installed Chrome over the DevTools protocol; no extra packages.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const origin = process.argv[2] ?? 'http://localhost:4414';
const outDir = resolve(process.argv[3] ?? 'docs/store');
const featureFile = resolve(process.argv[4] ?? join(outDir, 'feature-graphic.html'));
mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), 'grovyn-shots-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {}
  await sleep(200);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const go = async (url, wait = 3500) => { await send('Page.navigate', { url }); await sleep(wait); };
const shot = async (name) => {
  await evalJs(`document.querySelector('astro-dev-toolbar')?.remove(); window.scrollTo(0,0); 1`);
  await sleep(400);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, name), Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};

await send('Page.enable');
await send('Runtime.enable');


await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await go(`${origin}/rewarding-work/welcome/`);

// ---- sample data: three weeks of a person who uses Grovyn most days ----
const seed = String.raw`(() => {
  const DAY = 864e5, now = Date.now();
  const key = (t) => { const d = new Date(t); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const labels = ['Thesis chapter 3', 'Statistics revision', 'Client report', 'Spanish practice', 'Inbox zero'];
  const sessions = []; const chainDays = [];
  for (let d = 20; d >= 0; d--) {
    if (d % 7 === 3) continue;
    const n = d === 0 ? 2 : 2 + (d % 3);
    chainDays.push(key(today0.getTime() - d*DAY));
    for (let i = 0; i < n; i++) {
      const start = today0.getTime() - d*DAY + (9 + i*1.2)*36e5;
      const min = i % 2 ? 25 : 52;
      sessions.push({ id: 's'+start, start, end: start + min*6e4, focusSeconds: min*60, mode: min === 25 ? 'pomodoro' : '52-17', label: labels[(d+i)%labels.length], completed: true });
    }
  }
  const t = now - 3*DAY;
  const step = (id, text, done) => ({ id, text, done });
  const tasks = { current: 'k1', currentAt: t, items: [
    { id: 'k1', title: 'Write thesis chapter 3', list: 'today', todayAt: now, todayOrder: 0, status: 'active', createdAt: t, updatedAt: now,
      steps: [step('a','Reread supervisor notes',true), step('b','Outline the three sections',true), step('c','Draft section 3.1',false), step('d','Find two more sources',false), step('e','Draft section 3.2',false)] },
    { id: 'k2', title: 'Statistics: practice exam 2', list: 'today', todayAt: now, todayOrder: 1, status: 'active', createdAt: t, updatedAt: now,
      steps: [step('f','Questions 1–10',true), step('g','Questions 11–20',false), step('h','Check answers',false)] },
    { id: 'k3', title: 'Send the client report', list: 'today', todayAt: now, todayOrder: 2, status: 'active', createdAt: t, updatedAt: now, steps: [] },
    { id: 'k4', title: 'Plan next week', list: 'next', status: 'active', createdAt: t, updatedAt: t, steps: [] },
    { id: 'k5', title: 'Renew library books', list: 'next', status: 'active', createdAt: t, updatedAt: t, steps: [] },
    { id: 'k6', title: 'Learn 20 Spanish verbs', list: 'someday', status: 'active', createdAt: t, updatedAt: t, steps: [] },
  ]};
  const done = [
    { id: 'd1', text: 'Outline the three sections', doneAt: now - 2*36e5 },
    { id: 'd2', text: 'Reread supervisor notes', doneAt: now - 3*36e5 },
    { id: 'd3', text: 'Questions 1–10', doneAt: now - DAY },
    { id: 'd4', text: 'Booked the dentist', doneAt: now - DAY - 36e5 },
  ];
  const set = (k, v) => localStorage.setItem('rw:v1:' + k, JSON.stringify(v));
  localStorage.clear();
  set('profile', { welcomed: true, modules: { exam: true, health: true, budget: true, screen: true }, tours: { seen: ['today','timer','tasks','exam','coach','grove','health','budget','you','grove-stats'], off: true, nudgesOff: true, questsHidden: true } });
  set('sessions', sessions);
  set('tasks', tasks);
  set('done', done);
  set('chain', { habit: 'Focus every day', days: chainDays });
  const manual = {};
  for (let d = 0; d < 14; d++) {
    manual[key(today0.getTime() - d*DAY)] = { sleepMin: 400 + (d*37)%90, steps: 6200 + (d*1931)%5200, activeMin: 22 + (d*11)%25, restingHr: 58 + d%5 };
  }
  set('body-manual', manual);
  const mk = key(now).slice(0,7), dk = (n) => mk + '-' + String(n).padStart(2,'0');
  const td = new Date().getDate();
  const spend = [
    [1,'Rent','home',650],[2,'Groceries','food',54.2],[3,'Bus pass','transport',35],[3,'Gym','wellbeing',29],
    [4,'Coffee with Ana','fun',7.5],[5,'Groceries','food',38.9],[6,'Cinema','fun',12],[6,'Phone bill','home',18],[td,'Lunch','food',9.8],
  ].filter(([d]) => d <= td);
  set('health', { v: 2, budget: 1400, budgets: { food: 300, fun: 120, transport: 60 }, currency: '€', budgetAt: now,
    entries: spend.map(([d,what,category,amount],i) => ({ id: 'e'+i, day: dk(d), what, category, amount, createdAt: now - i })),
    repeats: [], incomes: [{ id: 'i1', day: dk(1), what: 'Salary', source: 'salary', amount: 2100, createdAt: now }],
    incomeRepeats: [], goals: [{ id: 'g1', name: 'Summer trip', target: 900, monthly: 150, createdAt: now, updatedAt: now }],
    saves: [{ id: 'v1', goalId: 'g1', day: dk(1), amount: 150, createdAt: now }], plan: { split: [50,30,20], tags: {} }, planAt: now });
  return sessions.length;
})()`;
console.log('sessions seeded:', await evalJs(seed));

const pages = [
  ['01-today.png', '/'],
  ['02-timer.png', '/timer/'],
  ['03-tasks.png', '/tasks/'],
  ['04-grove.png', '/progress/'],
  ['05-health.png', '/health/'],
  ['06-budget.png', '/budget/'],
  ['07-coach.png', '/techniques/'],
];
for (const [name, path] of pages) {
  await go(`${origin}/rewarding-work${path}`, 5000);
  await shot(name);
}
await send('Emulation.setEmulatedMedia', { features: [] });
if (featureFile) {
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false });
  await go('file:///' + featureFile.replace(/\\/g, '/'), 2500);
  await shot('feature-graphic.png');
}
ws.close();
chrome.kill();
