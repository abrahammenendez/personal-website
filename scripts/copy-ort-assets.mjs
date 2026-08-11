import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Copies ONNX Runtime's WebGPU runtime out of `node_modules` and into `public/`.
 *
 * It has to be a static asset rather than a bundled one. Importing the `.wasm` with
 * `?url` makes it a Vite asset, and Vite emits a worker into every environment that
 * references one, so the 23 MiB binary lands in the server bundle too and the Worker
 * script exceeds Cloudflare's 3 MiB limit. `public/` is copied to the client output
 * only, which is the whole point.
 *
 * These are build outputs of a pinned dependency, not source, so they are generated
 * rather than committed: git is the wrong place for a 23 MiB binary.
 *
 * Only the `asyncify` pair is needed. The package also ships a `jsep` build, which is
 * the deprecated WebGPU path and, at 25.58 MiB, exceeds the same 25 MiB asset limit.
 */
const FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const to = join(root, 'public', 'peelr', 'ort')

const ASSET_SIZE_LIMIT = 25 * 1024 * 1024

await mkdir(to, { recursive: true })

for (const file of FILES) {
  const source = join(from, file)
  const { size } = await stat(source)
  if (size > ASSET_SIZE_LIMIT) {
    throw new Error(
      `${file} is ${(size / 1024 / 1024).toFixed(2)} MiB, over Cloudflare's 25 MiB static asset limit`,
    )
  }
  await copyFile(source, join(to, file))
  console.log(`[peelr] ${file} (${(size / 1024 / 1024).toFixed(2)} MiB)`)
}
