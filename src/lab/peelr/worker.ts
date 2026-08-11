// Emitted as assets by Vite rather than served from `public/`. ONNX Runtime loads its
// runtime through a dynamic import, and Vite refuses to resolve a `public/` file as a
// module, so a URL prefix pointing there fails in development.
import ortRuntimeUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import type { InferenceSession } from 'onnxruntime-web/webgpu'
import { BINS, FRAMES, SEGMENT_SAMPLES, STEMS, type Stem } from './constants'
import { fetchModel } from './model'
import { type ModelOutput, type RunModel, separate } from './pipeline'
import type { WorkerRequest, WorkerScope } from './protocol'

const scope = self as unknown as WorkerScope

const SPEC_DIMS = [1, 4, BINS, FRAMES]
const MIX_DIMS = [1, 2, SEGMENT_SAMPLES]

let session: InferenceSession | undefined
let runModel: RunModel | undefined

/**
 * ONNX Runtime is imported dynamically so it never enters the page's initial bundle,
 * and from the `webgpu` subpath rather than the package root, whose default export
 * still loads the deprecated JSEP runtime.
 */
async function init(modelUrl: string): Promise<void> {
  const ort = await import('onnxruntime-web/webgpu')
  // Explicit per-file overrides rather than a prefix, so the URLs are the hashed ones
  // Vite emitted and nothing has to be copied into the served directory by hand.
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortRuntimeUrl }

  const buffer = await fetchModel(modelUrl, {
    onProgress: ({ loaded, total }) => scope.postMessage({ type: 'download', loaded, total }),
  })

  session = await ort.InferenceSession.create(buffer, {
    executionProviders: ['webgpu'],
    graphOptimizationLevel: 'all',
  })

  runModel = async ({ specNorm, mixNorm }) => {
    if (!session) throw new Error('session not initialised')
    const feeds = {
      spec_norm: new ort.Tensor('float32', specNorm, SPEC_DIMS),
      mix_norm: new ort.Tensor('float32', mixNorm, MIX_DIMS),
    }
    const results = await session.run(feeds)
    const freq = results.freq?.data
    const time = results.time?.data
    if (!(freq instanceof Float32Array) || !(time instanceof Float32Array)) {
      throw new Error('model returned unexpected output types')
    }
    return { freq, time } satisfies ModelOutput
  }

  scope.postMessage({ type: 'ready' })
}

async function run(left: Float32Array, right: Float32Array): Promise<void> {
  if (!runModel) throw new Error('worker used before init')

  const stems = await separate(left, right, runModel, {
    onProgress: (completed, total) => scope.postMessage({ type: 'progress', completed, total }),
  })

  const named = {} as Record<Stem, { left: Float32Array; right: Float32Array }>
  const transfer: Transferable[] = []
  STEMS.forEach((stem, index) => {
    const buffers = stems[index] as { left: Float32Array; right: Float32Array }
    named[stem] = buffers
    // Transfer rather than clone: each stem is tens of megabytes, and cloning would
    // briefly hold two copies of every one of them.
    transfer.push(buffers.left.buffer as ArrayBuffer, buffers.right.buffer as ArrayBuffer)
  })

  scope.postMessage({ type: 'done', stems: named }, transfer)
}

scope.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  try {
    const request = event.data
    if (request.type === 'init') await init(request.modelUrl)
    else if (request.type === 'separate') await run(request.left, request.right)
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})
