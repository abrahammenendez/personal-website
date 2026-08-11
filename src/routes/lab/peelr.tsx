import { createFileRoute } from '@tanstack/react-router'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { assertExperimentExists, buildExperimentPageHead } from '@/lab'
import { Peelr } from '@/lab/peelr'

const SLUG = 'peelr'
const experiment = assertExperimentExists(SLUG)

export const Route = createFileRoute('/lab/peelr')({
  head: () => buildExperimentPageHead(SLUG),
  component: PeelrRoute,
})

function PeelrRoute() {
  return (
    <main className="flex flex-col gap-6">
      <PageHeader title={experiment.title}>{experiment.description}</PageHeader>
      <Peelr />
      <BackLink to="/lab">Lab</BackLink>
    </main>
  )
}
