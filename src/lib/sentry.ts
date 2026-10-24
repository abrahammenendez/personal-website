/**
 * No SDK import here, so the browser bundle and the Worker entry can share
 * these values without pulling each other's SDK in.
 *
 * The DSN is public by design: it ships in the client bundle of every
 * Sentry-instrumented site and grants only the ability to send events to this
 * one project. It is a constant, not a secret.
 */
export const SENTRY_DSN =
  'https://0a554a84e6ffa7ca8d0fad029c4202c6@o4511772938338304.ingest.de.sentry.io/4511772952428624'

export const SENTRY_TRACES_SAMPLE_RATE = 0.1

/**
 * Only the deploy job sets this. `import.meta.env.PROD` is not enough: the
 * end-to-end suite runs a production build too.
 */
export const SENTRY_ENABLED = import.meta.env.VITE_SENTRY_ENABLED === 'true'
