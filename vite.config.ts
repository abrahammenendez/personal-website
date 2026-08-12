import { cloudflare } from '@cloudflare/vite-plugin'
import babel from '@rolldown/plugin-babel'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defaultClientConditions, defaultServerConditions, defineConfig, type Plugin } from 'vite'
// Relative and extension-qualified, not `@/`: Node resolves these while
// evaluating the config, before Vite's aliases apply.
import { ORT_ASSET_PREFIX } from './src/lab/peelr/constants.ts'
import { SITE } from './src/lib/seo.ts'

// Only set in the CI deploy job, so local builds skip source-map upload.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

/**
 * Selects the ONNX Runtime build that loads its `.wasm` from `env.wasm.wasmPaths`
 * rather than the default, which inlines a reference Vite turns into a bundled asset.
 * README.md has why that distinction decides whether the deploy succeeds.
 */
const ORT_EXTERN_WASM = 'onnxruntime-web-use-extern-wasm'

/**
 * ONNX Runtime reaches its runtime through a dynamic `import()`. The dev server's
 * import analysis appends `?import` to that URL and then refuses to resolve it, because
 * files under `public/` are served as-is rather than transformed. Symptom without this:
 * "no available backend found" under `vite dev`, while a production build works.
 */
const peelrOrtRuntime: Plugin = {
  name: 'peelr-ort-runtime',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (request.url?.startsWith(ORT_ASSET_PREFIX)) {
        request.url = request.url.split('?')[0]
      }
      next()
    })
  },
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    conditions: [ORT_EXTERN_WASM, ...defaultClientConditions],
  },
  ssr: { resolve: { conditions: [ORT_EXTERN_WASM, ...defaultServerConditions] } },
  /**
   * Pre-bundling rewrites the dynamic imports ONNX Runtime builds from
   * `env.wasm.wasmPaths`, leaving Vite trying to resolve a `public/` file as source.
   * Excluding it also stops the dev server discovering it mid-session and forcing a
   * full reload, which it does because peelr only imports it lazily.
   */
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  plugins: [
    peelrOrtRuntime,
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
