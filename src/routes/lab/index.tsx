import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/PageHeader'
import { type ExperimentMetadata, findAllPublishedExperiments } from '@/lab'
import { buildPageHead, buildPageTitle } from '@/lib/seo'

const TAGLINE = 'Playing with ideas and tech'

export const Route = createFileRoute('/lab/')({
  head: () =>
    buildPageHead({
      title: buildPageTitle('Lab'),
      description: TAGLINE,
      pathname: '/lab',
    }),
  component: LabRoute,
})

function LabRoute() {
  const experiments = findAllPublishedExperiments()

  return (
    <main className="flex flex-col gap-6">
      <PageHeader title={TAGLINE} />

      {experiments.length === 0 ? (
        <p>Coming soon.</p>
      ) : (
        <ul className="-my-3 flex flex-col">
          {experiments.map((experiment) => (
            <li key={experiment.slug}>
              <ExperimentLink experiment={experiment} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

/**
 * A plain anchor, not `<Link>`: every experiment is its own route file and
 * boots into a clean document. `active:` pairs with `hover:`, which Tailwind
 * gates behind `@media (hover:hover)`, leaving touch with no feedback.
 */
function ExperimentLink({ experiment }: Readonly<{ experiment: ExperimentMetadata }>) {
  return (
    <a
      href={`/lab/${experiment.slug}`}
      className="-mx-3 flex flex-col gap-1 rounded-lg p-3 transition-colors hover:bg-accent hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 active:bg-accent"
    >
      <span className="font-heading font-semibold underline underline-offset-2">
        {experiment.title}
      </span>
      <span>{experiment.description}</span>
    </a>
  )
}
