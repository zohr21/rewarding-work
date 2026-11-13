/**
 * Google Play screenshots and feature graphic, one set per language: docs/store/<lang>/.
 *
 * Each screenshot is a 1080x1920 frame: a short caption above the real app screen. The
 * screens come from the Play version with sample data seeded into localStorage, in the
 * frame's language (app text, sample tasks, currency). The last frame says the privacy
 * promise in words. The feature graphic is 1024x500.
 *
 *   1. Start the Play preview (needs .env for accounts):
 *        cmd:   set PUBLIC_PLAY_STORE=true&& npx astro dev --mode app --port 4414
 *        bash:  PUBLIC_PLAY_STORE=true npx astro dev --mode app --port 4414
 *   2. node scripts/store-shots.mjs                 every language in COPY
 *      node scripts/store-shots.mjs --lang=ru       one language
 *      node scripts/store-shots.mjs --origin=http://localhost:4414 --out=docs/store
 *
 * A new language: add it to COPY below (captions, feature graphic, sample data), after its
 * word list exists in src/lib/i18n. Uses the installed Chrome over the DevTools protocol;
 * no extra packages.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flag = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const origin = flag('origin', 'http://localhost:4414');
const outRoot = resolve(flag('out', 'docs/store'));

/**
 * What changes with the language. `captions` are for the six screen frames, in order;
 * <b> marks the words drawn in green. `money` is the sample budget's currency and how much
 * to multiply the sample amounts by, so they look like everyday prices in it.
 */
const COPY = {
  en: {
    captions: ['<b>One thing</b> first', 'A calm timer, your way', 'Big tasks, <b>small steps</b>', 'Every minute grows your grove', 'Stuck?<br>A technique that fits', 'Sleep, steps and budget, <b>if you want them</b>'],
    promise: { title: 'No ads. No tracking. <b>Yours.</b>', lines: ['Works without an account', 'Your data stays on your phone', 'No ads, no analytics', 'Delete everything any time'] },
    feature: { a: 'Focus a little.', b: 'Watch it grow.', p: 'A focus timer, tasks in small steps, and a grove that grows with every minute you put in.' },
    money: { currency: 'EUR', times: 1 },
    sample: {
      labels: ['Thesis chapter 3', 'Statistics revision', 'Client report', 'Spanish practice', 'Inbox zero'],
      tasks: ['Write thesis chapter 3', 'Statistics: practice exam 2', 'Send the client report', 'Plan next week', 'Renew library books', 'Learn 20 Spanish verbs'],
      steps: ['Reread supervisor notes', 'Outline the three sections', 'Draft section 3.1', 'Find two more sources', 'Draft section 3.2', 'Questions 1–10', 'Questions 11–20', 'Check answers'],
      done: ['Booked the dentist'],
      chain: 'Focus every day',
      spend: ['Rent', 'Groceries', 'Bus pass', 'Gym', 'Coffee with Ana', 'Groceries', 'Cinema', 'Phone bill', 'Lunch'],
      income: 'Salary',
      goal: 'Summer trip',
    },
  },
  ru: {
    captions: ['Сначала <b>одно дело</b>', 'Спокойный таймер на ваш лад', 'Большие задачи <b>маленькими шагами</b>', 'Каждая минута растит вашу рощу', 'Застряли?<br>Подберём технику', 'Сон, шаги и бюджет, <b>если захотите</b>'],
    promise: { title: 'Без рекламы. Без слежки. <b>Всё ваше.</b>', lines: ['Работает без аккаунта', 'Данные остаются на телефоне', 'Без рекламы и аналитики', 'Удалить всё можно в любой момент'] },
    feature: { a: 'Немного фокуса.', b: 'И роща растёт.', p: 'Таймер фокуса, задачи маленькими шагами и роща, которая растёт с каждой минутой.' },
    money: { currency: 'RUB', times: 100 },
    sample: {
      labels: ['Диплом, глава 3', 'Повторение статистики', 'Отчёт для клиента', 'Испанский', 'Разобрать почту'],
      tasks: ['Написать главу 3 диплома', 'Статистика: пробный экзамен 2', 'Отправить отчёт клиенту', 'Спланировать следующую неделю', 'Продлить книги в библиотеке', 'Выучить 20 испанских глаголов'],
      steps: ['Перечитать замечания руководителя', 'Набросать три раздела', 'Черновик раздела 3.1', 'Найти ещё два источника', 'Черновик раздела 3.2', 'Вопросы 1–10', 'Вопросы 11–20', 'Проверить ответы'],
      done: ['Записаться к стоматологу'],
      chain: 'Фокус каждый день',
      spend: ['Аренда', 'Продукты', 'Проездной', 'Спортзал', 'Кофе с Аней', 'Продукты', 'Кино', 'Телефон', 'Обед'],
      income: 'Зарплата',
      goal: 'Летняя поездка',
    },
  },
  az: {
    captions: ['Əvvəlcə <b>bir iş</b>', 'Sakit taymer, öz qaydanla', 'Böyük işlər, <b>kiçik addımlar</b>', 'Hər dəqiqə bağını böyüdür', 'İlişmisən?<br>Uyğun texnika tap', 'Yuxu, addımlar və büdcə, <b>istəsən</b>'],
    promise: { title: 'Reklamsız. İzləməsiz. <b>Sənindir.</b>', lines: ['Hesabsız işləyir', 'Məlumatların telefonunda qalır', 'Reklam və analitika yoxdur', 'İstədiyin vaxt hamısını silə bilərsən'] },
    feature: { a: 'Bir az fokus.', b: 'Bağın böyüyür.', p: 'Fokus taymeri, kiçik addımlarla işlər və hər dəqiqə ilə böyüyən bağ.' },
    money: { currency: 'AZN', times: 1 },
    sample: {
      labels: ['Dissertasiya, 3-cü fəsil', 'Statistika təkrarı', 'Müştəri hesabatı', 'İspan dili', 'Poçtu boşaltmaq'],
      tasks: ['Dissertasiyanın 3-cü fəslini yazmaq', 'Statistika: sınaq imtahanı 2', 'Müştəriyə hesabatı göndərmək', 'Gələn həftəni planlamaq', 'Kitabxana kitablarını uzatmaq', '20 ispan feli öyrənmək'],
      steps: ['Rəhbərin qeydlərini yenidən oxumaq', 'Üç bölmənin planını qurmaq', '3.1 bölməsinin qaralaması', 'Daha iki mənbə tapmaq', '3.2 bölməsinin qaralaması', 'Suallar 1–10', 'Suallar 11–20', 'Cavabları yoxlamaq'],
      done: ['Diş həkiminə yazılmaq'],
      chain: 'Hər gün fokus',
      spend: ['Kirayə', 'Ərzaq', 'Avtobus kartı', 'İdman zalı', 'Ayla ilə qəhvə', 'Ərzaq', 'Kino', 'Telefon', 'Nahar'],
      income: 'Maaş',
      goal: 'Yay səyahəti',
    },
  },
};

const only = flag('lang', 'all');
const langs = only === 'all' ? Object.keys(COPY) : [only];
for (const l of langs) if (!COPY[l]) throw new Error(`No copy for "${l}". Add it to COPY in scripts/store-shots.mjs.`);

// ---- Chrome ----
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;
const work = mkdtempSync(join(tmpdir(), 'grovyn-shots-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(work, 'profile')}`, '--hide-scrollbars', '--force-color-profile=srgb', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
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
const capture = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
};
const fileUrl = (p) => pathToFileURL(p).href;

await send('Page.enable');
await send('Runtime.enable');

// ---- sample data: three weeks of a person who uses Grovyn most days ----
const seed = (lang, modules) => `(() => {
  const T = ${JSON.stringify(COPY[lang].sample)}, MONEY = ${JSON.stringify(COPY[lang].money)};
  const DAY = 864e5, now = Date.now();
  const key = (t) => { const d = new Date(t); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const sessions = []; const chainDays = [];
  for (let d = 20; d >= 0; d--) {
    if (d % 7 === 3) continue;
    const n = d === 0 ? 2 : 2 + (d % 3);
    chainDays.push(key(today0.getTime() - d*DAY));
    for (let i = 0; i < n; i++) {
      const start = today0.getTime() - d*DAY + (9 + i*1.2)*36e5;
      const min = i % 2 ? 25 : 52;
      sessions.push({ id: 's'+start, start, end: start + min*6e4, focusSeconds: min*60, mode: min === 25 ? 'pomodoro' : '52-17', label: T.labels[(d+i)%T.labels.length], completed: true });
    }
  }
  const t = now - 3*DAY;
  const step = (id, n, done) => ({ id, text: T.steps[n], done });
  const tasks = { current: 'k1', currentAt: t, items: [
    { id: 'k1', title: T.tasks[0], list: 'today', todayAt: now, todayOrder: 0, status: 'active', createdAt: t, updatedAt: now,
      steps: [step('a',0,true), step('b',1,true), step('c',2,false), step('d',3,false), step('e',4,false)] },
    { id: 'k2', title: T.tasks[1], list: 'today', todayAt: now, todayOrder: 1, status: 'active', createdAt: t, updatedAt: now,
      steps: [step('f',5,true), step('g',6,false), step('h',7,false)] },
    { id: 'k3', title: T.tasks[2], list: 'today', todayAt: now, todayOrder: 2, status: 'active', createdAt: t, updatedAt: now, steps: [] },
    { id: 'k4', title: T.tasks[3], list: 'next', status: 'active', createdAt: t, updatedAt: t, steps: [] },
    { id: 'k5', title: T.tasks[4], list: 'next', status: 'active', createdAt: t, updatedAt: t, steps: [] },
    { id: 'k6', title: T.tasks[5], list: 'someday', status: 'active', createdAt: t, updatedAt: t, steps: [] },
  ]};
  const done = [
    { id: 'd1', text: T.steps[1], doneAt: now - 2*36e5 },
    { id: 'd2', text: T.steps[0], doneAt: now - 3*36e5 },
    { id: 'd3', text: T.steps[5], doneAt: now - DAY },
    { id: 'd4', text: T.done[0], doneAt: now - DAY - 36e5 },
  ];
  const set = (k, v) => localStorage.setItem('rw:v1:' + k, JSON.stringify(v));
  localStorage.clear();
  set('lang', ${JSON.stringify(lang)});
  set('profile', { welcomed: true, modules: ${JSON.stringify(modules)}, tours: { seen: ['today','timer','tasks','exam','coach','grove','health','budget','you','grove-stats'], off: true, nudgesOff: true, questsHidden: true } });
  set('sessions', sessions);
  set('tasks', tasks);
  set('done', done);
  set('chain', { habit: T.chain, days: chainDays });
  const manual = {};
  for (let d = 0; d < 14; d++) {
    manual[key(today0.getTime() - d*DAY)] = { sleepMin: 400 + (d*37)%90, steps: 6200 + (d*1931)%5200, activeMin: 22 + (d*11)%25, restingHr: 58 + d%5 };
  }
  set('body-manual', manual);
  const mk = key(now).slice(0,7), dk = (n) => mk + '-' + String(n).padStart(2,'0');
  const td = new Date().getDate();
  const x = (n) => Math.round(n * MONEY.times * 100) / 100;
  const spend = [
    [1,0,'home',650],[2,1,'food',54.2],[3,2,'transport',35],[3,3,'wellbeing',29],
    [4,4,'fun',7.5],[5,5,'food',38.9],[6,6,'fun',12],[6,7,'home',18],[td,8,'food',9.8],
  ].filter(([d]) => d <= td);
  set('health', { v: 2, budget: x(1400), budgets: { food: x(300), fun: x(120), transport: x(60) }, currency: MONEY.currency, budgetAt: now,
    entries: spend.map(([d,n,category,amount],i) => ({ id: 'e'+i, day: dk(d), what: T.spend[n], category, amount: x(amount), createdAt: now - i })),
    repeats: [], incomes: [{ id: 'i1', day: dk(1), what: T.income, source: 'salary', amount: x(2100), createdAt: now }],
    incomeRepeats: [], goals: [{ id: 'g1', name: T.goal, target: x(900), monthly: x(150), createdAt: now, updatedAt: now }],
    saves: [{ id: 'v1', goalId: 'g1', day: dk(1), amount: x(150), createdAt: now }], plan: { split: [50,30,20], tags: {} }, planAt: now });
  return sessions.length;
})()`;

/** The app screens, in frame order. The first five show the app as it starts: four tabs, no optional sections. */
const SCREENS = [
  ['today', '/'],
  ['timer', '/timer/'],
  ['tasks', '/tasks/'],
  ['grove', '/progress/'],
  ['coach', '/techniques/'],
];
const EXTRA = [
  ['health', '/health/'],
  ['budget', '/budget/'],
];
const CORE = { exam: false, health: false, budget: false, screen: false };
const ALL = { exam: true, health: true, budget: true, screen: false };

// ---- the frames ----
const font = (file) => fileUrl(join(root, 'src/assets/fonts', file));
const CSS = `
  @font-face { font-family: 'Bricolage Grotesque'; font-weight: 200 800; src: url('${font('bricolage-grotesque-latin-wght-normal.woff2')}') format('woff2-variations'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
  @font-face { font-family: 'Bricolage Grotesque'; font-weight: 200 800; src: url('${font('bricolage-grotesque-latin-ext-wght-normal.woff2')}') format('woff2-variations'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
  @font-face { font-family: 'Instrument Sans'; font-weight: 400 700; src: url('${font('instrument-sans-latin-wght-normal.woff2')}') format('woff2-variations'); unicode-range: U+0000-00FF, U+0131, U+2000-206F, U+20AC; }
  @font-face { font-family: 'Instrument Sans'; font-weight: 400 700; src: url('${font('instrument-sans-latin-ext-wght-normal.woff2')}') format('woff2-variations'); unicode-range: U+0100-02BA, U+1E00-1E9F; }
  @font-face { font-family: 'Onest'; font-weight: 100 900; src: url('${font('onest-cyrillic-wght-normal.woff2')}') format('woff2-variations'); unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: 'Onest'; font-weight: 100 900; src: url('${font('onest-cyrillic-ext-wght-normal.woff2')}') format('woff2-variations'); unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F; }
  html, body { margin: 0; overflow: hidden; }
  body {
    background:
      radial-gradient(70% 34% at 82% 4%, rgba(242, 193, 78, 0.16), transparent 70%),
      radial-gradient(80% 40% at 8% 100%, rgba(143, 224, 174, 0.13), transparent 70%),
      #0e1512;
    color: #eef1ec;
    font-family: 'Instrument Sans', 'Onest', sans-serif;
    position: relative;
  }
  h1 { font-family: 'Bricolage Grotesque', 'Onest', sans-serif; font-weight: 700; letter-spacing: -0.02em; margin: 0; text-wrap: balance; }
  h1 b { color: #8fe0ae; font-weight: 700; }
  .phone { position: absolute; border-radius: 64px; padding: 14px; background: #050806; box-shadow: 0 0 0 3px #2a3a31, 0 40px 120px rgba(0, 0, 0, 0.6), 0 0 160px rgba(143, 224, 174, 0.1); }
  .phone img { display: block; width: 100%; border-radius: 50px; }
`;
const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="#8fe0ae"><rect x="14" y="38" width="4" height="16" rx="2"/><circle cx="16" cy="35" r="6.5"/><rect x="30" y="30" width="4" height="24" rx="2"/><circle cx="32" cy="25" r="9"/><rect x="46" y="23" width="4" height="31" rx="2"/><circle cx="48" cy="17" r="7.5"/></g><circle fill="#f2c14e" cx="48" cy="17" r="2.75"/></svg>`;
const doc = (lang, w, h, body, css = '') => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${CSS} html, body { width: ${w}px; height: ${h}px; } ${css}</style></head><body>${body}</body></html>`;

/** One screen under its caption; the phone runs off the bottom of the frame. */
const screenFrame = (lang, caption, shot) =>
  doc(lang, 1080, 1920, `<h1>${caption}</h1><div class="phone" style="left:100px;top:372px;width:852px"><img src="${fileUrl(shot)}"></div>`,
    `h1 { position: absolute; left: 80px; right: 80px; top: 84px; height: 230px; display: grid; place-items: center; text-align: center; font-size: 84px; line-height: 1.04; }`);

/** Two optional sections side by side. */
const pairFrame = (lang, caption, left, right) =>
  doc(lang, 1080, 1920, `<h1>${caption}</h1>
    <div class="phone" style="left:44px;top:470px;width:480px;border-radius:44px;padding:10px"><img style="border-radius:34px" src="${fileUrl(left)}"></div>
    <div class="phone" style="left:556px;top:390px;width:480px;border-radius:44px;padding:10px"><img style="border-radius:34px" src="${fileUrl(right)}"></div>`,
    `h1 { position: absolute; left: 80px; right: 80px; top: 84px; height: 230px; display: grid; place-items: center; text-align: center; font-size: 76px; line-height: 1.06; }`);

/** The privacy promise in words, with Sprig. */
const promiseFrame = (lang, promise, sprig) =>
  doc(lang, 1080, 1920, `<div class="brand">${MARK}<span>grovyn</span></div><h1>${promise.title.replace(/\. /g, '.<br>')}</h1>
    <ul>${promise.lines.map((l) => `<li><i></i>${l}</li>`).join('')}</ul><div class="sprig">${sprig}</div>`,
    `.brand { position: absolute; left: 96px; top: 110px; display: flex; align-items: center; gap: 18px; font-family: 'Bricolage Grotesque'; font-weight: 700; font-size: 56px; letter-spacing: -0.03em; }
     .brand svg { width: 78px; height: 78px; }
     h1 { position: absolute; left: 96px; right: 80px; top: 290px; font-size: 112px; line-height: 1.04; }
     ul { position: absolute; left: 96px; right: 80px; top: 800px; margin: 0; padding: 0; list-style: none; display: grid; gap: 34px; font-size: 46px; font-weight: 500; color: #d5ded7; }
     li { display: flex; align-items: center; gap: 28px; }
     li i { flex: none; width: 56px; height: 56px; border-radius: 50%; background: #1f4a35 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 12.5l4 4 8-9' fill='none' stroke='%238fe0ae' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 34px no-repeat; }
     .sprig { position: absolute; left: 0; right: 0; bottom: 110px; display: grid; place-items: center; }
     .sprig svg { width: 420px; height: auto; }`);

const featureFrame = (lang, f, sprig) =>
  doc(lang, 1024, 500, `<div class="copy"><div class="brand">${MARK}<span>grovyn</span></div><h1>${f.a}<br><b>${f.b}</b></h1><p>${f.p}</p></div><div class="sprig">${sprig}</div>`,
    `.copy { position: absolute; left: 72px; top: 50%; transform: translateY(-50%); width: 580px; }
     .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 26px; font-family: 'Bricolage Grotesque'; font-weight: 700; font-size: 40px; letter-spacing: -0.03em; }
     .brand svg { width: 56px; height: 56px; }
     h1 { font-size: 60px; line-height: 1.02; margin-bottom: 20px; text-wrap: nowrap; }
     p { font-size: 22px; line-height: 1.4; margin: 0; color: #b8c4bc; max-width: 520px; }
     .sprig { position: absolute; right: 84px; top: 0; bottom: 0; display: grid; place-items: center; }
     .sprig svg { width: 250px; height: auto; filter: drop-shadow(0 30px 50px rgba(0, 0, 0, 0.5)); }`);

const phoneSize = () => send('Emulation.setDeviceMetricsOverride', { width: 360, height: 760, deviceScaleFactor: 3, mobile: true });
const frameSize = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

for (const lang of langs) {
  const copy = COPY[lang];
  const outDir = join(outRoot, lang);
  mkdirSync(outDir, { recursive: true });
  const raw = (name) => join(work, `${lang}-${name}.png`);

  // 1. The app's own screens.
  await phoneSize();
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await go(`${origin}/rewarding-work/welcome/`);
  let sprig = '';
  for (const [modules, screens] of [[CORE, SCREENS], [ALL, EXTRA]]) {
    await evalJs(seed(lang, modules));
    for (const [name, path] of screens) {
      await go(`${origin}/rewarding-work${path}`, 5000);
      await evalJs(`document.querySelector('astro-dev-toolbar')?.remove(); window.scrollTo(0,0); 1`);
      await sleep(400);
      await capture(raw(name));
      // Sprig as this sample person has grown it, for the frames without a screen.
      if (name === 'timer') sprig = (await evalJs(`document.querySelector('[data-timer-sprig] svg')?.outerHTML ?? ''`)) || '';
    }
  }
  if (!sprig) throw new Error('Sprig was not found on the timer page.');

  // 2. The frames.
  await send('Emulation.setEmulatedMedia', { features: [] });
  const frames = [
    ...SCREENS.map(([name], i) => [`0${i + 1}-${name}.png`, screenFrame(lang, copy.captions[i], raw(name)), 1080, 1920]),
    ['06-more.png', pairFrame(lang, copy.captions[5], raw('health'), raw('budget')), 1080, 1920],
    ['07-private.png', promiseFrame(lang, copy.promise, sprig), 1080, 1920],
    ['feature-graphic.png', featureFrame(lang, copy.feature, sprig), 1024, 500],
  ];
  const html = join(work, 'frame.html');
  for (const [name, markup, w, h] of frames) {
    writeFileSync(html, markup);
    await frameSize(w, h);
    await go(fileUrl(html), 1200);
    await evalJs('document.fonts.ready.then(() => 1)');
    await capture(join(outDir, name));
    console.log('saved', `${lang}/${name}`);
  }
}

ws.close();
chrome.kill();
await sleep(300);
try { rmSync(work, { recursive: true, force: true }); } catch {}
