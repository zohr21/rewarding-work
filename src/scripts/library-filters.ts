/**
 * Technique library filters: category, problem, title search.
 * State is mirrored in the URL (?category=time&problem=cant-start&q=pom) so filtered
 * views can be linked to and survive reloads / the back button.
 */
export function initLibraryFilters(): void {
  const form = document.querySelector<HTMLFormElement>('[data-filters]');
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-technique]'));
  const count = document.querySelector<HTMLElement>('[data-count]');
  const empty = document.querySelector<HTMLElement>('[data-empty]');
  const reset = document.querySelector<HTMLButtonElement>('[data-reset]');
  if (!form || !count) return;

  const search = form.elements.namedItem('q') as HTMLInputElement;

  function radioValue(name: string): string {
    return form!.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
  }

  function setRadio(name: string, value: string): void {
    const input =
      form!.querySelector<HTMLInputElement>(`input[name="${name}"][value="${CSS.escape(value)}"]`) ??
      form!.querySelector<HTMLInputElement>(`input[name="${name}"][value=""]`);
    if (input) input.checked = true;
  }

  function apply(updateUrl: boolean): void {
    const category = radioValue('category');
    const problem = radioValue('problem');
    const q = search.value.trim().toLowerCase();

    let shown = 0;
    for (const card of cards) {
      const match =
        (!category || card.dataset.category === category) &&
        (!problem || (card.dataset.problems ?? '').split(' ').includes(problem)) &&
        (!q || (card.dataset.title ?? '').includes(q));
      card.hidden = !match;
      if (match) shown++;
    }

    count!.textContent =
      shown === cards.length ? `Showing all ${cards.length} techniques` : `Showing ${shown} of ${cards.length} techniques`;
    if (empty) empty.hidden = shown !== 0;

    if (updateUrl) {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (problem) params.set('problem', problem);
      if (q) params.set('q', q);
      const qs = params.toString();
      history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    }
  }

  function readUrl(): void {
    const params = new URLSearchParams(location.search);
    setRadio('category', params.get('category') ?? '');
    setRadio('problem', params.get('problem') ?? '');
    search.value = params.get('q') ?? '';
  }

  form.addEventListener('input', () => apply(true));
  form.addEventListener('submit', (e) => e.preventDefault());
  reset?.addEventListener('click', () => {
    form.reset();
    apply(true);
    search.focus();
  });

  readUrl();
  apply(false);
}
