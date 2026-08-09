import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'

export function NotFound() {
  return (
    <main className="flex flex-col gap-6">
      <PageHeader title="Not found">
        That page does not exist. It may have moved, or the link may be wrong.
      </PageHeader>
      <BackLink to="/">Home</BackLink>
    </main>
  )
}
