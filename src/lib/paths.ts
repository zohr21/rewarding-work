import { NATIVE_APP } from '../config/app';

/** `path` under Astro's `base`, without a trailing slash ('' for the home page at base "/"). */
function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}

/**
 * Build an internal URL that respects Astro's `base` (needed for GitHub Pages
 * project sites, where everything lives under /<repo>/).
 *   url('/timer') -> '/rewarding-work/timer'
 *
 * In the Android app there is no web server to turn /timer into /timer/index.html
 * (it would show the home page instead), so page links name the file:
 *   url('/timer') -> '/timer/index.html'
 */
export function url(path = '/'): string {
  const full = withBase(path);
  if (!NATIVE_APP) return full || '/';
  const [, page = '', rest = ''] = /^([^?#]*)(.*)$/.exec(full) ?? [];
  const isFile = /\.[^/]+$/.test(page);
  return isFile ? full : `${page.replace(/\/$/, '')}/index.html${rest}`;
}

/** True when `current` (Astro.url.pathname) is `path` or a child of it. */
export function isActive(current: string, path: string): boolean {
  const target = withBase(path).replace(/\/$/, '');
  const here = current.replace(/\/$/, '');
  if (path === '/') return here === target || here === '';
  return here === target || here.startsWith(`${target}/`);
}
