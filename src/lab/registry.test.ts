import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertExperimentExists,
  buildExperimentHref,
  EXPERIMENTS,
  findAllPublishedExperiments,
  findExperiment,
} from './registry'

const ROUTES_LAB_DIR = path.resolve(import.meta.dirname, '../routes/lab')

function routeFileFor(slug: string) {
  return path.join(ROUTES_LAB_DIR, `${slug}.tsx`)
}

describe('EXPERIMENTS', () => {
  it('has a unique slug per experiment', () => {
    const slugs = EXPERIMENTS.map((experiment) => experiment.slug)

    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('declares createdAt as an ISO date', () => {
    for (const { createdAt } of EXPERIMENTS) {
      expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('declares every href as an absolute URL', () => {
    for (const { href } of EXPERIMENTS.filter(({ href }) => href)) {
      expect(href).toMatch(/^https:\/\//)
    }
  })

  // `assertExperimentExists` guards the other direction. Nothing else catches
  // this one, so a listed experiment with no route file would 404 in prod.
  it('has a route file for every experiment hosted here', () => {
    for (const { slug } of EXPERIMENTS.filter(({ href }) => !href)) {
      expect(existsSync(routeFileFor(slug)), `missing src/routes/lab/${slug}.tsx`).toBe(true)
    }
  })

  it('has no route file for an experiment that links off-site', () => {
    for (const { slug } of EXPERIMENTS.filter(({ href }) => href)) {
      expect(existsSync(routeFileFor(slug)), `stale src/routes/lab/${slug}.tsx`).toBe(false)
    }
  })
})

describe('findAllPublishedExperiments', () => {
  it('keeps the order they are declared in', () => {
    const published = EXPERIMENTS.filter((experiment) => experiment.published)

    expect(findAllPublishedExperiments()).toEqual(published)
  })

  it('omits unpublished experiments', () => {
    expect(findAllPublishedExperiments().every((experiment) => experiment.published)).toBe(true)
  })
})

describe('buildExperimentHref', () => {
  it('points at its own page when the experiment is hosted here', () => {
    expect(buildExperimentHref(assertExperimentExists('peelr'))).toBe('/lab/peelr')
  })

  it('points off-site when the experiment declares an href', () => {
    expect(buildExperimentHref(assertExperimentExists('puzdrop'))).toBe(
      'https://github.com/abrahammenendez/puzdrop',
    )
  })
})

describe('findExperiment', () => {
  it('finds an experiment by slug', () => {
    expect(findExperiment('hello-server')?.title).toBe('Hello, server')
  })

  it('returns undefined for an unknown slug', () => {
    expect(findExperiment('nope')).toBeUndefined()
  })
})
