import type { ExperimentMetadata } from './types'

/** An entry here plus a route file at `src/routes/lab/{slug}.tsx` ships an experiment. */
export const EXPERIMENTS: readonly ExperimentMetadata[] = [
  {
    slug: 'peelr',
    title: 'peelr',
    description:
      'Stem separation that runs entirely on your own GPU. Drop in a song, get the drums, bass, vocals and everything else as separate tracks. Nothing is uploaded.',
    createdAt: '2026-08-11',
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

/** Newest first, the order `/lab` renders. */
export function findAllPublishedExperiments(): readonly ExperimentMetadata[] {
  return EXPERIMENTS.filter((experiment) => experiment.published).toSorted((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
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
