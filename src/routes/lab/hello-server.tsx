import { createFileRoute } from '@tanstack/react-router'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { assertExperimentExists, buildExperimentPageHead } from '@/lab'
import { HelloServer } from '@/lab/hello-server'

const SLUG = 'hello-server'
const experiment = assertExperimentExists(SLUG)

export const Route = createFileRoute('/lab/hello-server')({
  head: () => buildExperimentPageHead(SLUG),
  component: HelloServerRoute,
})

function HelloServerRoute() {
  return (
    <main className="flex flex-col gap-6">
      <PageHeader title={experiment.title}>{experiment.description}</PageHeader>
      <HelloServer />
      <BackLink to="/lab">Lab</BackLink>
    </main>
  )
}
