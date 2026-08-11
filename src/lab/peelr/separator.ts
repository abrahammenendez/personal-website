import { MODEL_URL, type Stem } from './constants'
import type { WorkerResponse } from './protocol'

export type Stems = Record<Stem, { left: Float32Array; right: Float32Array }>

export interface SeparatorEvents {
  onDownload?: (loaded: number, total: number) => void
  onProgress?: (completed: number, total: number) => void
}

/**
 * Typed client for the separation worker.
 *
 * The worker owns the ONNX Runtime session and outlives a single track, so separating a
 * second file pays neither the download nor the session build again.
 */
export class Separator {
  private readonly worker: Worker
  private ready: Promise<void> | undefined

  constructor(private readonly events: SeparatorEvents = {}) {
    // Vite rewrites this form at build time; a bare string path would not be bundled.
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  }

  /** Downloads the model and builds the session. Safe to call more than once. */
  init(modelUrl: string = MODEL_URL): Promise<void> {
    this.ready ??= this.request({ type: 'init', modelUrl }, (message) =>
      message.type === 'ready' ? { done: true, value: undefined } : undefined,
    )
    return this.ready
  }

  async separate(left: Float32Array, right: Float32Array): Promise<Stems> {
    await this.init()
    return this.request(
      { type: 'separate', left, right },
      (message) => (message.type === 'done' ? { done: true, value: message.stems } : undefined),
      // The page no longer needs its copy once the worker has it.
      [left.buffer as ArrayBuffer, right.buffer as ArrayBuffer],
    )
  }

  /** Releases the session and its GPU buffers. */
  dispose(): void {
    this.worker.terminate()
  }

  private request<T>(
    message: Parameters<Worker['postMessage']>[0],
    resolveOn: (response: WorkerResponse) => { done: true; value: T } | undefined,
    transfer: Transferable[] = [],
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data
        if (response.type === 'download') {
          this.events.onDownload?.(response.loaded, response.total)
          return
        }
        if (response.type === 'progress') {
          this.events.onProgress?.(response.completed, response.total)
          return
        }
        if (response.type === 'error') {
          cleanup()
          reject(new Error(response.message))
          return
        }
        const settled = resolveOn(response)
        if (settled) {
          cleanup()
          resolve(settled.value)
        }
      }
      const onError = (event: ErrorEvent) => {
        cleanup()
        reject(new Error(event.message || 'separation worker crashed'))
      }
      const cleanup = () => {
        this.worker.removeEventListener('message', onMessage)
        this.worker.removeEventListener('error', onError)
      }

      this.worker.addEventListener('message', onMessage)
      this.worker.addEventListener('error', onError)
      this.worker.postMessage(message, transfer)
    })
  }
}
