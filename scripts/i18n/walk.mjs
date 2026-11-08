/**
 * Finds the English text written into .astro markup, for the translation scripts
 * (tag.mjs and check.mjs). Parses with Astro's own compiler, so positions are exact.
 *
 * Each finding is one of:
 * - `text`: an element whose only content is plain text → can get `data-t="key"`;
 * - `attr`: a fixed aria-label / title / placeholder / alt → can get `data-t-<attr>="key"`;
 * - `hand`: text mixed with tags or `{…}` expressions, which a person has to split or
 *   move into `t()`; the scripts list these instead of guessing.
 */
import { parse } from '@astrojs/compiler-rs';

export const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
/** Elements whose content is never interface text. */
const SKIP = new Set(['script', 'style', 'svg', 'code', 'pre', 'title', 'template']);

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', times: '×', middot: '·', rsaquo: '›', lsaquo: '‹',
};

export function decode(text) {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, name) => {
    if (name[0] === '#') return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
    return ENTITIES[name] ?? whole;
  });
}

/** Whitespace collapsed, entities decoded. */
export function clean(text) {
  return decode(text).replace(/\s+/g, ' ').trim();
}

const hasWords = (s) => /\p{L}{2,}/u.test(s);

function nameOf(el) {
  const n = el.openingElement?.name;
  if (!n) return '';
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return 'Member';
  if (n.type === 'JSXNamespacedName') return `${n.namespace.name}:${n.name.name}`;
  return '';
}

function attr(el, name) {
  return el.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name?.name === name);
}

/** Literal strings with words anywhere inside an expression (`{x ? 'Yes' : 'No'}`). */
function literalWords(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => literalWords(n, out));
    return out;
  }
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return out; // walked on its own
  if ((node.type === 'Literal' && typeof node.value === 'string') || node.type === 'TemplateElement') {
    const v = node.type === 'TemplateElement' ? node.value?.cooked ?? '' : node.value;
    if (hasWords(v) && !/^[\w-]+$/.test(v.trim()) && !/^[./#]|https?:/.test(v.trim())) out.push(v);
  }
  for (const k of Object.keys(node)) if (k !== 'start' && k !== 'end') literalWords(node[k], out);
  return out;
}

/**
 * Every finding in one .astro file's markup.
 * `insertAt` is where a new attribute goes (just after the tag name).
 */
export function findText(source) {
  const { ast } = parse(source);
  const found = [];
  const lineOf = (offset) => source.slice(0, offset).split('\n').length;

  function element(el) {
    const name = nameOf(el);
    if (SKIP.has(name)) return;
    const html = /^[a-z]/.test(name);
    const insertAt = el.openingElement.name.end;
    const line = lineOf(el.start);

    if (html || name) {
      for (const a of ATTRS) {
        const at = attr(el, a);
        if (!at || at.value?.type !== 'Literal' || typeof at.value.value !== 'string') continue;
        if (!hasWords(at.value.value) || attr(el, `data-t-${a}`)) continue;
        // Components take these as props of their own; only plain elements get the data- twin.
        if (html) found.push({ kind: 'attr', attr: a, text: clean(at.value.value), insertAt, line, tag: name });
      }
    }

    const kids = (el.children ?? []).filter(
      (c) =>
        !(c.type === 'JSXText' && !c.value.trim()) &&
        c.type !== 'AstroComment' &&
        !(c.type === 'JSXExpressionContainer' && c.expression?.type === 'JSXEmptyExpression'),
    );
    const textOnly = kids.length > 0 && kids.every((c) => c.type === 'JSXText');
    if (html && textOnly) {
      const text = clean(kids.map((c) => c.value).join(' '));
      if (hasWords(text) && !attr(el, 'data-t') && !attr(el, 'set:html') && !attr(el, 'set:text')) {
        found.push({ kind: 'text', text, insertAt, line, tag: name });
      }
    } else if (!attr(el, 'data-t')) {
      const loose = kids.filter((c) => c.type === 'JSXText' && hasWords(c.value)).map((c) => clean(c.value));
      const inExpr = kids.filter((c) => c.type === 'JSXExpressionContainer').flatMap((c) => literalWords(c.expression));
      if (loose.length || inExpr.length) found.push({ kind: 'hand', text: [...loose, ...inExpr.map((s) => `{'${s}'}`)].join(' … '), line, tag: name });
    }
    walk(el.children);
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === 'JSXElement') return element(node);
    for (const k of Object.keys(node)) if (k !== 'start' && k !== 'end') walk(node[k]);
  }

  walk(ast.body);
  return found;
}
