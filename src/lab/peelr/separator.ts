import type { Stems } from './pipeline'
import type { WorkerRequest, WorkerResponse } from './protocol'

export interface SeparatorEvents {
  onDownload?: (loaded: number, total: number) => void
  onProgress?: (completed: number, total: number) => void
}

/** The worker owns the ONNX Runtime session, so later tracks reuse it. */
export class Separator {
  private readonly worker: Worker
  private ready: Promise<unknown> | undefined

  constructor(private readonly events: SeparatorEvents = {}) {
    // Vite rewrites this form at build time; a bare string path would not be bundled.
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  }

  /** Downloads the model and builds the session. A failure leaves a retry possible. */
  async init(): Promise<void> {
    this.ready ??= this.request({ type: 'init' }, 'ready')
    try {
      await this.ready
    } catch (error) {
      this.ready = undefined
      throw error
    }
  }

  async separate(left: Float32Array, right: Float32Array): Promise<Stems> {
    await this.init()
    const done = await this.request({ type: 'separate', left, right }, 'done', [
      // The page no longer needs its copy once the worker has it.
      left.buffer as ArrayBuffer,
      right.buffer as ArrayBuffer,
    ])
    return done.stems
  }

  /** Releases the session and its GPU buffers. */
  dispose(): void {
    this.worker.terminate()
  }

  private request<T extends WorkerResponse['type']>(
    message: WorkerRequest,
    settleOn: T,
    transfer: Transferable[] = [],
  ): Promise<Extract<WorkerResponse, { type: T }>> {
    return new Promise((resolve, reject) => {
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
        if (response.type === settleOn) {
          cleanup()
          resolve(response as Extract<WorkerResponse, { type: T }>)
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
