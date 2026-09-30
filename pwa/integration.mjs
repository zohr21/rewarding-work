/**
 * Tiny Astro integration (no dependencies): after `astro build`, writes dist/sw.js
 * from pwa/sw.template.js with the list of every built file and a content hash,
 * so each deploy gets a new cache and old ones are cleaned up.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The Firebase chunk (src/lib/account/firebase.ts) is only needed by people who sign in,
// so it isn't precached for everyone; the worker caches it the first time it's used.
// Same for the sound recordings (a few MB each): only the ones someone plays are cached.
const SKIP = [/\.map$/, /^sw\.js$/, /^\.nojekyll$/, /^_astro\/firebase\.[^/]+\.js$/, /^sounds\//];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])),
  );
  return files.flat();
}

export default function serviceWorker() {
  return {
    name: 'rewarding-work:service-worker',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const out = fileURLToPath(dir);

        // Guard: Astro 7 on Windows silently drops all CSS when the project folder path
        // is very long (seen at ~150 characters). Catch it instead of shipping an unstyled site.
        const home = await readFile(join(out, 'index.html'), 'utf8');
        if (!/rel="stylesheet"|<style/.test(home)) {
          const msg =
            `The build contains no CSS. On Windows this happens when the project path is too long ` +
            `(${process.cwd().length} characters here). Move the project to a shorter folder, e.g. C:\\code\\rewarding-work.`;
          if (process.env.CI) throw new Error(msg);
          logger.warn(msg);
        }

        const files = (await walk(out))
          .map((f) => ({ abs: f, rel: relative(out, f).split(sep).join('/') }))
          .filter(({ rel }) => !SKIP.some((re) => re.test(rel)))
          .sort((a, b) => a.rel.localeCompare(b.rel));

        // The version covers every built file *and* the worker code itself, so changing
        // either one gives a fresh cache and old caches are deleted on activate.
        const template = await readFile(new URL('./sw.template.js', import.meta.url), 'utf8');
        const hash = createHash('sha256');
        hash.update(template);
        for (const f of files) {
          hash.update(f.rel);
          hash.update(await readFile(f.abs));
        }
        const version = hash.digest('hex').slice(0, 12);

        const sw = template
          .replace("'__VERSION__'", JSON.stringify(version))
          .replace('/* __PRECACHE__ */ []', JSON.stringify(files.map((f) => f.rel), null, 2));
        if (sw.includes('/* __PRECACHE__ */ []') || sw.includes("'__VERSION__'")) {
          throw new Error('pwa/sw.template.js placeholders were not replaced — check the template.');
        }
        await writeFile(join(out, 'sw.js'), sw);
        logger.info(`sw.js written: ${files.length} files precached, version ${version}`);
      },
    },
  };
}
