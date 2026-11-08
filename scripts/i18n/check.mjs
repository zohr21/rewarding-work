/**
 * How far the translation has got, and anything broken.
 *
 *   npm run i18n:check               # summary
 *   npm run i18n:check -- --english  # also list each piece of English left in markup
 *
 * Fails (exit 1) only on real mistakes: a `data-t…` key that is not in en.ts, or a key in
 * ru.ts / az.ts that en.ts no longer has. Missing translations are reported, not failed,
 * because a missing key falls back to English.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findText } from './walk.mjs';
import { LANGS, readList } from './lists.mjs';

const listEnglish = process.argv.includes('--english');
const lists = Object.fromEntries(LANGS.map((l) => [l, readList(l)]));
const en = lists.en;
let errors = 0;

function files(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

const area = (key) => key.split('.')[0];

// 1. Each translation against English.
console.log('Translations');
for (const lang of LANGS.filter((l) => l !== 'en')) {
  const have = lists[lang];
  const missing = [...en.keys()].filter((k) => !have.has(k));
  const stale = [...have.keys()].filter((k) => !en.has(k));
  const pct = Math.round(((en.size - missing.length) / en.size) * 100);
  const byArea = {};
  for (const k of missing) byArea[area(k)] = (byArea[area(k)] ?? 0) + 1;
  const areas = Object.entries(byArea).map(([a, n]) => `${a} ${n}`).join(', ');
  console.log(`  ${lang}: ${en.size - missing.length}/${en.size} keys (${pct}%)${missing.length ? ` — missing: ${areas}` : ''}`);
  for (const k of stale) {
    console.log(`  ✗ ${lang}.ts has '${k}', which en.ts does not`);
    errors++;
  }
  // A translation must fill in the same {names} as the English, or a raw "{time}" shows.
  const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [k, text] of have) {
    if (en.has(k) && names(text) !== names(en.get(k))) {
      console.log(`  ✗ ${lang}.ts '${k}' uses {${names(text)}}, English uses {${names(en.get(k))}}`);
      errors++;
    }
  }
}

// 2. Keys used in markup must exist.
const astro = files('src', '.astro');
for (const file of astro) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/data-t(?:-(?!n=)[\w-]+)?="([\w.-]+)"/g)) {
    if (!en.has(m[1])) {
      console.log(`  ✗ ${file}:${src.slice(0, m.index).split('\n').length} uses '${m[1]}', which en.ts does not have`);
      errors++;
    }
  }
}

// 3. English still written straight into markup.
console.log('\nEnglish left in markup (text / attributes / by hand)');
const rows = [];
for (const file of astro) {
  let found;
  try {
    found = findText(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`  ? ${file}: could not parse (${e.message})`);
    continue;
  }
  if (!found.length) continue;
  const n = (kind) => found.filter((f) => f.kind === kind).length;
  rows.push([file.replace(/\\/g, '/'), n('text'), n('attr'), n('hand'), found]);
}
rows.sort((a, b) => b[1] + b[2] + b[3] - (a[1] + a[2] + a[3]));
for (const [file, t, a, h, found] of rows) {
  console.log(`  ${String(t).padStart(3)} ${String(a).padStart(3)} ${String(h).padStart(3)}  ${file}`);
  if (listEnglish) for (const f of found) console.log(`        ${f.line}: ${f.kind === 'attr' ? `${f.attr}=` : f.kind === 'hand' ? 'by hand: ' : ''}${f.text}`);
}
const total = rows.reduce((s, r) => s + r[1] + r[2] + r[3], 0);
console.log(`  ${total} left in ${rows.length} files. Script-built text is not counted here; look for English in <script> blocks.`);

if (errors) {
  console.log(`\n${errors} problem(s).`);
  process.exit(1);
}
