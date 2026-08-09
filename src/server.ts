import { withSentry } from '@sentry/cloudflare'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import handler from '@tanstack/react-start/server-entry'
import { applySecurityHeaders } from '@/lib/security-headers'
import { SENTRY_DSN, SENTRY_ENABLED, SENTRY_TRACES_SAMPLE_RATE } from '@/lib/sentry'

/**
 * Wrapping here catches every response leaving the Worker, and sitting inside
 * `wrapFetchWithSentry` keeps this step inside Sentry's span.
 */
const requestHandlerWithSecurityHeaders = {
  async fetch(request: Request) {
    const response = await handler.fetch(request)
    return applySecurityHeaders(response)
  },
}

/**
 * Custom Worker entry, pointed at by `main` in `wrangler.jsonc`. The DSN is
 * only supplied in production, so `vite dev` (Worker under miniflare) never
 * reports.
 */
export default withSentry(
  () => ({
    dsn: SENTRY_ENABLED ? SENTRY_DSN : undefined,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
  }),
  wrapFetchWithSentry(requestHandlerWithSecurityHeaders),
)
