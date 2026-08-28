import { SENTRY_DSN } from './sentry'

// Cloudflare injects its Web Analytics beacon at the edge, outside this
// Worker's control, so script-src has to allow it explicitly.
const CLOUDFLARE_BEACON_ORIGIN = 'https://static.cloudflareinsights.com'

// Derived from the DSN so the allow-listed origin cannot drift from the one
// the client SDK actually reports to.
const SENTRY_INGEST_ORIGIN = new URL(SENTRY_DSN).origin

// TanStack Devtools injects its panel's CSS through an unnonced inline
// <style>, which a strict style-src blocks: the panel mounts but every rule
// silently fails. Devtools are stripped from production builds, so this
// relaxation never reaches it.
const STYLE_SRC = import.meta.env.DEV ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'"

/**
 * `script-src` allows `'unsafe-inline'` because TanStack Start's hydration
 * boot script and this app's own inline scripts (theme init, JSON-LD) ship
 * without a nonce. Nonces are the stricter alternative but must be unique per
 * request, which prerendering rules out: one static HTML file per route is
 * built once and served to every visitor.
 * See https://github.com/TanStack/router/discussions/3028.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // `wasm-unsafe-eval` lets WebAssembly compile. It does not permit `eval`.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${CLOUDFLARE_BEACON_ORIGIN}`,
  // Both fall back to `script-src` and `default-src` when left unset, which blocks the
  // dev server's `blob:` module workers and any `blob:` handed to `<audio>`.
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  STYLE_SRC,
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${SENTRY_INGEST_ORIGIN}`,
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  // 2 years, all subdomains, eligible for the preload list. Submitting to
  // hstspreload.org is a separate manual step this header does not do.
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Kept alongside CSP's frame-ancestors for browsers that predate it.
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), interest-cohort=()',
}

/**
 * Cloudflare serves prerendered assets from the edge cache without
 * invoking the Worker, so these reach server-function calls and unmatched
 * routes, not the prerendered pages.
 */
export function applySecurityHeaders(response: Response): Response {
  // Responses from a sub-fetch (TanStack Start's asset/route fallback) carry
  // immutable Headers, so they must be copied before they can be set.
  const mutable = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    mutable.headers.set(name, value)
  }
  return mutable
}
