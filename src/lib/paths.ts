/**
 * Build an internal URL that respects Astro's `base` (needed for GitHub Pages
 * project sites, where everything lives under /<repo>/).
 *   url('/timer') -> '/rewarding-work/timer'
 */
export function url(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}` || '/';
}

/** True when `current` (Astro.url.pathname) is `path` or a child of it. */
export function isActive(current: string, path: string): boolean {
  const target = url(path).replace(/\/$/, '');
  const here = current.replace(/\/$/, '');
  if (path === '/') return here === target || here === '';
  return here === target || here.startsWith(`${target}/`);
}
