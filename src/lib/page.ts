/**
 * Page lifecycle for Astro's client-side router (<ClientRouter /> in BaseLayout).
 *
 * With the router, navigating swaps the page body without a full reload, so the
 * ambient scene and background sound keep playing. The catch: a component's
 * <script> runs only once per visit, not once per page. So component scripts
 * register their setup with `onPage`, which runs it on every page load (including
 * the first) and runs the cleanup it returns just before the next page swaps in.
 */

type Cleanup = void | (() => void);

const registered = new Set<string>();

/**
 * Run `setup` on every page load. Return a function to undo anything that outlives
 * the page's DOM: storage subscriptions, intervals, listeners on window/document.
 * `key` makes a second registration of the same setup (e.g. a re-run script) a no-op.
 */
export function onPage(key: string, setup: () => Cleanup): void {
  if (registered.has(key)) return;
  registered.add(key);

  let cleanup: Cleanup;
  const run = () => {
    if (typeof cleanup === 'function') cleanup();
    cleanup = setup();
  };
  document.addEventListener('astro:page-load', run);
  document.addEventListener('astro:before-swap', () => {
    if (typeof cleanup === 'function') cleanup();
    cleanup = undefined;
  });
}

/** Collects cleanup functions; `run` calls them all once. */
export function cleanups(): { add: (fn: () => void) => void; run: () => void } {
  const fns: (() => void)[] = [];
  return {
    add: (fn) => fns.push(fn),
    run: () => fns.splice(0).forEach((fn) => fn()),
  };
}

/** addEventListener that returns its own removal. */
export function listen<K extends keyof DocumentEventMap>(
  target: Document,
  type: K,
  fn: (e: DocumentEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void;
export function listen<K extends keyof WindowEventMap>(
  target: Window,
  type: K,
  fn: (e: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void;
export function listen(target: EventTarget, type: string, fn: (e: Event) => void, options?: AddEventListenerOptions): () => void {
  target.addEventListener(type, fn, options);
  return () => target.removeEventListener(type, fn, options);
}
