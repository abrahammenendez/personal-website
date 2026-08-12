import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Node strips the types, so peelr and this script cannot disagree about the path.
import { ORT_ASSET_PREFIX } from '../src/lab/peelr/constants.ts'

/**
 * Copies ONNX Runtime's WebGPU runtime into `public/` on `predev` and `prebuild`.
 * README.md has why it is a static asset rather than a bundled one. `public/` is copied
 * to the client output only.
 *
 * Generated rather than committed: these are build outputs of a pinned dependency, and
 * git is the wrong place for a 23 MiB binary.
 *
 * Only the `asyncify` pair is needed. The package also ships a `jsep` build, which is
 * the deprecated WebGPU path and, at 25.58 MiB, over the limit checked below anyway.
 */
const FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']

/** Cloudflare's cap on an individual static asset. */
const ASSET_SIZE_LIMIT = 25 * 1024 * 1024

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const to = join(root, 'public', ORT_ASSET_PREFIX)

await mkdir(to, { recursive: true })

for (const file of FILES) {
  const source = join(from, file)
  const { size } = await stat(source)
  // Fails here on a dependency bump rather than in the deploy, where Cloudflare
  // reports it as an opaque upload error.
  if (size > ASSET_SIZE_LIMIT) {
    throw new Error(
      `${file} is ${(size / 1024 / 1024).toFixed(2)} MiB, over Cloudflare's 25 MiB asset limit`,
    )
  }
  await copyFile(source, join(to, file))
}
