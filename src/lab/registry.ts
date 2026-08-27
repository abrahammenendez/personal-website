import type { ExperimentMetadata } from './types'

/**
 * Declaration order is the order `/lab` renders. An entry plus a route file at
 * `src/routes/lab/{slug}.tsx` ships an experiment, unless `href` sends it off-site.
 */
export const EXPERIMENTS: readonly ExperimentMetadata[] = [
  {
    slug: 'peelr',
    title: 'peelr',
    description:
      'Free stem separation that runs entirely on your own GPU. Drop in a song, get the drums, bass, vocals and everything else as separate tracks. Nothing is uploaded.',
    createdAt: '2026-08-11',
    published: true,
  },
  {
    slug: 'puzdrop',
    title: 'puzdrop',
    description:
      'Automatically downloads my favourite daily crossword, converts it to a valid .puz file, and delivers it to my phone.',
    createdAt: '2026-08-25',
    href: 'https://github.com/abrahammenendez/puzdrop',
    published: true,
  },
  {
    slug: 'hello-server',
    title: 'Hello, server',
    description:
      'A round trip through every layer of this site: a server function on the Worker, Zod at the boundary, TanStack Query on the client, and Sentry across both.',
    createdAt: '2026-07-21',
    published: false,
  },
] as const

export function findAllPublishedExperiments(): readonly ExperimentMetadata[] {
  return EXPERIMENTS.filter((experiment) => experiment.published)
}

/** Where `/lab` sends a visitor: the experiment's own page, or off-site. */
export function buildExperimentHref(experiment: ExperimentMetadata): string {
  return experiment.href ?? `/lab/${experiment.slug}`
}

export function findExperiment(slug: string): ExperimentMetadata | undefined {
  return EXPERIMENTS.find((experiment) => experiment.slug === slug)
}

/**
 * Throws during prerendering, so a route pointing at a missing slug fails the
 * build instead of shipping a page with an empty title.
 */
export function assertExperimentExists(slug: string): ExperimentMetadata {
  const experiment = findExperiment(slug)
  if (!experiment) {
    throw new Error(`No experiment registered for slug "${slug}"`)
  }
  return experiment
}
