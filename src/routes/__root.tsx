import { TanStackDevtools } from '@tanstack/react-devtools'
import { createRootRoute, HeadContent, ScriptOnce, Scripts } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import type { ReactNode } from 'react'
import { NotFound } from '@/components/NotFound'
import { SiteHeader } from '@/components/SiteHeader'
import { Toaster } from '@/components/ui/sonner'
import { APPLE_TOUCH_ICON, FAVICON_PNG, FAVICON_SVG } from '@/lib/assets'
import { FONT_PRELOAD_LINKS } from '@/lib/fonts'
import { PERSON_SCHEMA, SITE } from '@/lib/seo'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  // Page-invariant tags only. Everything else comes from each route's own
  // `head()`; see `buildPageHead` for why nothing may fall back to here.
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { name: 'author', content: SITE.name },
      { name: 'theme-color', content: SITE.themeColor },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE.name },
      { property: 'og:locale', content: SITE.ogLocale },
      { property: 'og:image', content: SITE.ogImage },
      { property: 'og:image:width', content: SITE.ogImageWidth },
      { property: 'og:image:height', content: SITE.ogImageHeight },
      { property: 'og:image:alt', content: `${SITE.name}, logo mark` },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: SITE.twitterHandle },
      { name: 'twitter:creator', content: SITE.twitterHandle },
      { name: 'twitter:image', content: SITE.ogImage },
    ],
    links: [
      ...FONT_PRELOAD_LINKS,
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: FAVICON_SVG },
      { rel: 'icon', type: 'image/png', href: FAVICON_PNG },
      { rel: 'apple-touch-icon', href: APPLE_TOUCH_ICON },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang={SITE.lang} suppressHydrationWarning>
      <head>
        {/* React hoists <link rel="stylesheet"> above this script regardless of
            JSX order, which is harmless: the stylesheet is render-blocking, so
            nothing paints until both have run. */}
        <ScriptOnce>{THEME_INIT_SCRIPT}</ScriptOnce>
        <HeadContent />
      </head>
      {/* No `antialiased`: it thins strokes on macOS. */}
      <body className="font-serif">
        <div className="mx-auto max-w-[40em] px-6 text-body">
          <SiteHeader />
          {children}
        </div>
        <Toaster />
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data
          dangerouslySetInnerHTML={{ __html: JSON.stringify(PERSON_SCHEMA) }}
        />
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[{ name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> }]}
        />
        <Scripts />
      </body>
    </html>
  )
}
