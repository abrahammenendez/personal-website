import { cloudflare } from '@cloudflare/vite-plugin'
import babel from '@rolldown/plugin-babel'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defaultClientConditions, defaultServerConditions, defineConfig } from 'vite'
// Relative and extension-qualified, not `@/`: Node resolves this while
// evaluating the config, before Vite's aliases apply.
import { SITE } from './src/lib/seo.ts'

// Only set in the CI deploy job, so local builds skip source-map upload.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

/**
 * ONNX Runtime ships two builds behind an export condition. The default one inlines
 * references to its own `.wasm`, so Vite emits that 23 MiB binary as an asset into
 * every environment, including the server, and the Worker script then exceeds
 * Cloudflare's 3 MiB limit. This condition selects the build that loads the runtime
 * from `env.wasm.wasmPaths` instead, which is what peelr serves out of `public/`.
 */
const ORT_EXTERN_WASM = 'onnxruntime-web-use-extern-wasm'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    conditions: [ORT_EXTERN_WASM, ...defaultClientConditions],
  },
  ssr: { resolve: { conditions: [ORT_EXTERN_WASM, ...defaultServerConditions] } },
  /**
   * ONNX Runtime loads its own WebAssembly runtime through dynamic imports built from
   * `env.wasm.wasmPaths`. Pre-bundling rewrites those imports, so Vite then tries to
   * resolve a file we serve from `public/` as if it were source and fails. Excluding it
   * also stops the dev server discovering it mid-session and forcing a full reload,
   * which it does because peelr only imports it lazily.
   */
  optimizeDeps: { exclude: ['onnxruntime-web'] },
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
