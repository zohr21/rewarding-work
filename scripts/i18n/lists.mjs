/**
 * Reads and extends the word lists in src/lib/i18n (en.ts, ru.ts, az.ts) as text, so the
 * scripts need no TypeScript build. One entry per line: `'area.key': 'Text',` or a plural
 * `'area.key': { one: '…', other: '…' },`.
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const LIST_DIR = 'src/lib/i18n';
export const LANGS = ['en', 'ru', 'az'];

const ENTRY = /^\s*'([\w.]+)':\s*(.+?),?\s*$/;
const STRING = /^'((?:[^'\\]|\\.)*)'$|^"((?:[^"\\]|\\.)*)"$/;

function unquote(raw) {
  const m = raw.trim().replace(/,$/, '').match(STRING);
  if (!m) return null; // a plural object
  return (m[1] ?? m[2]).replace(/\\(.)/g, '$1');
}

/** key → English text (plurals: their `other` form), for one list. */
export function readList(lang) {
  const map = new Map();
  for (const line of readFileSync(`${LIST_DIR}/${lang}.ts`, 'utf8').split('\n')) {
    const m = line.match(ENTRY);
    if (!m) continue;
    const text = unquote(m[2]);
    map.set(m[1], text ?? (m[2].match(/other:\s*'((?:[^'\\]|\\.)*)'/)?.[1] ?? '').replace(/\\(.)/g, '$1'));
  }
  return map;
}

export function quote(text) {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Append entries to a list, under a comment naming where they came from.
 * en.ts ends its object with `} as const;`, the others with `};`.
 */
export function appendEntries(lang, heading, entries) {
  if (!entries.length) return;
  const path = `${LIST_DIR}/${lang}.ts`;
  const src = readFileSync(path, 'utf8');
  const end = src.lastIndexOf(lang === 'en' ? '} as const;' : '};');
  if (end < 0) throw new Error(`Could not find the end of ${path}`);
  const lines = entries.map(([key, text]) => `  '${key}': ${text},`).join('\n');
  writeFileSync(path, `${src.slice(0, end).replace(/\s*$/, '\n')}\n  // ${heading}\n${lines}\n${src.slice(end)}`);
}

/** `timer` + "Pick a rhythm, name your task" → `timer.pickARhythmName`. */
export function slug(prefix, text, taken) {
  const words = text
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  let base = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('').slice(0, 32) || 'text';
  if (/^\d/.test(base)) base = `n${base}`;
  let key = `${prefix}.${base}`;
  for (let n = 2; taken.has(key); n++) key = `${prefix}.${base}${n}`;
  return key;
}
