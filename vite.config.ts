import { cloudflare } from '@cloudflare/vite-plugin'
import babel from '@rolldown/plugin-babel'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
// Relative and extension-qualified, not `@/`: Node resolves this while
// evaluating the config, before Vite's aliases apply.
import { SITE } from './src/lib/seo.ts'

// Only set in the CI deploy job, so local builds skip source-map upload.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart({
      prerender: { enabled: true, crawlLinks: true },
      sitemap: { enabled: true, host: SITE.url },
    }),
    babel({
      include: /\.[jt]sx?$/,
      plugins: ['babel-plugin-react-compiler'],
    }),
    viteReact(),
    ...(sentryAuthToken
      ? [
          sentryTanstackStart({
            org: 'abrahammenendez',
            project: 'personal-website',
            authToken: sentryAuthToken,
          }),
        ]
      : []),
  ],
})
