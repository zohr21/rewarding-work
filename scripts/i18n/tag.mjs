/**
 * Tags the fixed English text in .astro files for translation.
 *
 *   node scripts/i18n/tag.mjs <area> <file.astro>...           # show what it would do
 *   node scripts/i18n/tag.mjs <area> <file.astro>... --write   # do it
 *
 * Each element holding only plain text gets `data-t="<area>.<key>"`, each fixed aria-label /
 * title / placeholder / alt gets `data-t-<attr>="<key>"`, and the English goes into
 * src/lib/i18n/en.ts. The same text in the same area shares one key. Text mixed with tags
 * or `{…}` is only listed ("by hand"): split it into spans or move it into `t()` yourself.
 * Then translate the new keys in ru.ts and az.ts, and run `npm run i18n:check`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { findText } from './walk.mjs';
import { appendEntries, quote, readList, slug } from './lists.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const [area, ...files] = args.filter((a) => a !== '--write');
if (!area || !/^[a-z][\w]*$/.test(area) || !files.length) {
  console.error('Usage: node scripts/i18n/tag.mjs <area> <file.astro>... [--write]');
  process.exit(1);
}

const en = readList('en');
const taken = new Set(en.keys());
/** The same English in this area reuses its key. */
const byText = new Map([...en].filter(([k]) => k.startsWith(`${area}.`)).map(([k, v]) => [v, k]));
const added = [];
let hand = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const found = findText(source);
  const edits = [];
  for (const f of found) {
    if (f.kind === 'hand') {
      hand++;
      console.log(`  by hand  ${file}:${f.line}  <${f.tag}>  ${f.text}`);
      continue;
    }
    let key = byText.get(f.text);
    if (!key) {
      key = slug(area, f.text, taken);
      taken.add(key);
      byText.set(f.text, key);
      added.push([key, quote(f.text), file]);
    }
    const attrName = f.kind === 'attr' ? `data-t-${f.attr}` : 'data-t';
    edits.push({ at: f.insertAt, text: ` ${attrName}="${key}"` });
    console.log(`  ${f.kind === 'attr' ? f.attr.padEnd(8) : 'text    '} ${file}:${f.line}  ${key}  “${f.text}”`);
  }
  if (write && edits.length) {
    let out = source;
    for (const e of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, e.at) + e.text + out.slice(e.at);
    writeFileSync(file, out);
  }
}

if (write) {
  const byFile = new Map();
  for (const [key, text, file] of added) byFile.set(file, [...(byFile.get(file) ?? []), [key, text]]);
  for (const [file, entries] of byFile) appendEntries('en', `${file.replace(/\\/g, '/')} (tagged by scripts/i18n/tag.mjs)`, entries);
}

console.log(`\n${added.length} new keys, ${hand} spots to do by hand.${write ? '' : ' Nothing written: add --write.'}`);
