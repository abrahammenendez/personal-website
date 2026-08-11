import type { Stem } from './constants'

/** Messages the page sends to the worker. */
export type WorkerRequest =
  | { type: 'init'; modelUrl: string; wasmPrefix: string }
  | { type: 'separate'; left: Float32Array; right: Float32Array }

/** Messages the worker sends back. */
export type WorkerResponse =
  | { type: 'download'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'progress'; completed: number; total: number }
  | { type: 'done'; stems: Record<Stem, { left: Float32Array; right: Float32Array }> }
  | { type: 'error'; message: string }

/**
 * `lib` in `tsconfig.json` is DOM rather than WebWorker, so `self` types as a window.
 * Declaring the handful of members the worker uses is cheaper than adding a lib that
 * would collide with DOM across the whole repository.
 */
export interface WorkerScope {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerRequest>) => void | Promise<void>,
  ): void
}
