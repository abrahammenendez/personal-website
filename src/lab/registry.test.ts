import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXPERIMENTS, findAllPublishedExperiments, findExperiment } from './registry'

const ROUTES_LAB_DIR = path.resolve(import.meta.dirname, '../routes/lab')

describe('EXPERIMENTS', () => {
  it('has a unique slug per experiment', () => {
    const slugs = EXPERIMENTS.map((experiment) => experiment.slug)

    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('declares createdAt as an ISO date', () => {
    for (const experiment of EXPERIMENTS) {
      expect(experiment.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  // `assertExperimentExists` guards the other direction. Nothing else catches
  // this one, so a listed experiment with no route file would 404 in prod.
  it('has a route file for every slug', () => {
    for (const experiment of EXPERIMENTS) {
      const routeFile = path.join(ROUTES_LAB_DIR, `${experiment.slug}.tsx`)
      expect(existsSync(routeFile), `missing src/routes/lab/${experiment.slug}.tsx`).toBe(true)
    }
  })
})

describe('findAllPublishedExperiments', () => {
  it('orders newest first', () => {
    const dates = findAllPublishedExperiments().map((experiment) => experiment.createdAt)

    expect(dates).toEqual([...dates].toSorted().toReversed())
  })

  it('omits unpublished experiments', () => {
    expect(findAllPublishedExperiments().every((experiment) => experiment.published)).toBe(true)
  })

  it('leaves the registry order untouched', () => {
    const before = EXPERIMENTS.map((experiment) => experiment.slug)

    findAllPublishedExperiments()

    expect(EXPERIMENTS.map((experiment) => experiment.slug)).toEqual(before)
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
