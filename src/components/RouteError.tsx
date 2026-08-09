import * as Sentry from '@sentry/tanstackstart-react'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'

/**
 * Captures here rather than relying on `src/start.ts`: neither Sentry's request
 * middleware nor its server-function middleware observes a route that throws
 * while rendering.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  Sentry.captureException(error)

  return (
    <main className="flex flex-col gap-6">
      <PageHeader title="Something went wrong">
        This page hit an unexpected error. It has been reported.
      </PageHeader>
      <div className="flex items-center gap-4">
        <Button onClick={reset}>Try again</Button>
        <BackLink to="/">Back home</BackLink>
      </div>
    </main>
  )
}
