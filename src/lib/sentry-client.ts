import * as Sentry from '@sentry/tanstackstart-react'
import { SENTRY_DSN, SENTRY_ENABLED, SENTRY_TRACES_SAMPLE_RATE } from './sentry'

type Router = Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0]

let initialized = false

/** `getRouter()` runs on both server and client, hence the guards. */
export function setupClientSentry(router: Router): void {
  if (initialized || typeof window === 'undefined' || !SENTRY_ENABLED) {
    return
  }
  initialized = true

  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
    // Noise no personal site can act on: benign browser quirks, and errors
    // thrown by the visitor's own extensions.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
    ],
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-extension:\/\//],
  })
}
