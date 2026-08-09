import { buildPageHead, buildPageTitle } from '@/lib/seo'
import { assertExperimentExists } from './registry'

export function buildExperimentPageHead(slug: string) {
  const experiment = assertExperimentExists(slug)

  return buildPageHead({
    title: buildPageTitle(experiment.title),
    description: experiment.description,
    pathname: `/lab/${slug}`,
  })
}
