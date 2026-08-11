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
async function init(modelUrl: string, wasmPrefix: string): Promise<void> {
  const ort = await import('onnxruntime-web/webgpu')
  ort.env.wasm.wasmPaths = wasmPrefix

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
    if (request.type === 'init') await init(request.modelUrl, request.wasmPrefix)
    else if (request.type === 'separate') await run(request.left, request.right)
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})
