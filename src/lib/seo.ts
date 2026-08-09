// Extension-qualified: `vite.config.ts` loads this module under Node, which
// does not infer one. See the note in `assets.ts`.
import { OG_IMAGE } from './assets.ts'

/**
 * The apex is the real origin; `www` only redirects to it. Every canonical,
 * `og:url` and sitemap entry derives from this, so that choice is made once.
 */
const SITE_URL = 'https://abrahammenendez.com'

export const SITE = {
  url: SITE_URL,
  name: 'Abraham Menéndez',
  description: 'Abraham Menéndez is a software developer based in Amsterdam (The Netherlands).',
  jobTitle: 'Software Developer',
  email: 'menendezabraham@gmail.com',
  lang: 'en',
  ogLocale: 'en_US',
  ogImage: getAbsoluteUrl(OG_IMAGE),
  ogImageWidth: '1200',
  ogImageHeight: '630',
  themeColor: '#252525',
  twitterHandle: '@abrahamenendez',
  social: {
    linkedin: 'https://www.linkedin.com/in/abraham-menendez',
    github: 'https://github.com/abrahammenendez',
    twitter: 'https://twitter.com/abrahamenendez',
  },
} as const

export const PERSON_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: SITE.name,
  jobTitle: SITE.jobTitle,
  url: SITE.url,
  email: `mailto:${SITE.email}`,
  sameAs: [SITE.social.linkedin, SITE.social.github, SITE.social.twitter],
} as const

/** Open Graph rejects relative image URLs. */
export function getAbsoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}

/** `<title>` for a page below the home page: `{page} — {site}`. */
export function buildPageTitle(title: string): string {
  return `${title} — ${SITE.name}`
}

/**
 * The per-page slice of a route's `head()`. Everything page-invariant
 * (charset, theme-color, og:image, …) lives in `__root.tsx` instead.
 *
 * Every route must call this, including the home route. TanStack Router
 * de-duplicates `meta` by `name`/`property` across matches but never
 * `links`, so the root cannot supply a fallback canonical without every
 * page ending up with two.
 */
export function buildPageHead({
  title,
  description,
  pathname,
}: {
  title: string
  description: string
  pathname: string
}) {
  const url = getAbsoluteUrl(pathname)

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}
