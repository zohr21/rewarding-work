import { getCollection, type CollectionEntry } from 'astro:content';
import type { ProblemSlug } from '../data/taxonomy';

export type Technique = CollectionEntry<'techniques'>;

/** All techniques, alphabetically by title. */
export async function getTechniques(): Promise<Technique[]> {
  const all = await getCollection('techniques');
  return all.sort((a, b) => a.data.title.localeCompare(b.data.title));
}

export async function getTechniquesForProblem(problem: ProblemSlug): Promise<Technique[]> {
  const all = await getTechniques();
  return all.filter((t) => t.data.problems.includes(problem));
}

/**
 * Related techniques: hand-picked `related` slugs first (build fails on an unknown slug),
 * then filled up to `limit` with the techniques sharing the most problems/category.
 */
export function getRelated(current: Technique, all: Technique[], limit = 3): Technique[] {
  const byId = new Map(all.map((t) => [t.id, t]));
  const picked: Technique[] = [];

  for (const slug of current.data.related ?? []) {
    const t = byId.get(slug);
    if (!t) throw new Error(`Technique "${current.id}" lists unknown related slug "${slug}"`);
    if (t.id !== current.id) picked.push(t);
  }

  if (picked.length < limit) {
    const scored = all
      .filter((t) => t.id !== current.id && !picked.includes(t))
      .map((t) => ({
        t,
        score:
          t.data.problems.filter((p) => current.data.problems.includes(p)).length +
          (t.data.category === current.data.category ? 1 : 0),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.t.data.title.localeCompare(b.t.data.title));
    picked.push(...scored.map((s) => s.t));
  }

  return picked.slice(0, limit);
}
