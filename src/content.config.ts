import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { CATEGORY_SLUGS, EVIDENCE_LEVELS, PROBLEM_SLUGS, TIMER_MODES, TOOL_SLUGS } from './data/taxonomy';

const techniques = defineCollection({
  // The `slug` frontmatter field becomes the entry id (and the URL).
  loader: glob({ pattern: '**/*.md', base: './src/content/techniques' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase-with-hyphens'),
    category: z.enum(CATEGORY_SLUGS),
    problems: z.array(z.enum(PROBLEM_SLUGS)).min(1),
    evidence: z.enum(EVIDENCE_LEVELS),
    time_to_try: z.number().int().positive(),
    summary: z.string(),
    tool: z.enum(TOOL_SLUGS).optional(),
    /** Which timer mode the embedded timer opens in (only used when tool is "timer"). */
    timer_mode: z.enum(TIMER_MODES).optional(),

    // Additions beyond the core schema — see README "Adding a technique".
    /** Bullet points for the "When it does NOT work" section. */
    limits: z.array(z.string()).min(1),
    /** Plain-language evidence note shown next to the badge. No invented citations. */
    evidence_note: z.string(),
    /** Optional hand-picked related technique slugs; otherwise computed from shared problems. */
    related: z.array(z.string()).optional(),
  }),
});

/**
 * The same techniques in other languages: `<lang>/<slug>.md` holds the body, the limits and the
 * evidence note. Title and summary live in the language lists (`tech.<slug>.title`), since cards
 * on many pages show them. The article page checks every technique has each language.
 */
const techniqueTexts = defineCollection({
  loader: glob({ pattern: '*/*.md', base: './src/content/techniques-i18n' }),
  schema: z.object({
    limits: z.array(z.string()).min(1),
    evidence_note: z.string(),
  }),
});

export const collections = { techniques, techniqueTexts };
