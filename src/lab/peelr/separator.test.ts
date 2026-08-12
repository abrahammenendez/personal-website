import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Stems } from './pipeline'
import type { WorkerResponse } from './protocol'
import { Separator } from './separator'

/** Replies to each `postMessage` with the next batch in the script. */
function fakeWorker(script: WorkerResponse[][]) {
  return class {
    private readonly listeners = new Map<string, Set<EventListener>>()

    addEventListener(type: string, listener: EventListener) {
      const forType = this.listeners.get(type) ?? new Set()
      forType.add(listener)
      this.listeners.set(type, forType)
    }

    removeEventListener(type: string, listener: EventListener) {
      this.listeners.get(type)?.delete(listener)
    }

    postMessage() {
      const replies = script.shift() ?? []
      queueMicrotask(() => {
        for (const data of replies) {
          for (const listener of this.listeners.get('message') ?? []) {
            listener(new MessageEvent('message', { data }))
          }
        }
      })
    }

    terminate() {}
  }
}

const silence = () => ({ left: new Float32Array(1), right: new Float32Array(1) })
const stems: Stems = {
  drums: silence(),
  bass: silence(),
  other: silence(),
  vocals: silence(),
}

afterEach(() => vi.unstubAllGlobals())

describe('Separator', () => {
  it('can retry initialisation after the worker reports an error', async () => {
    vi.stubGlobal(
      'Worker',
      fakeWorker([[{ type: 'error', message: 'model unavailable' }], [{ type: 'ready' }]]),
    )
    const separator = new Separator()

    await expect(separator.init()).rejects.toThrow('model unavailable')
    await expect(separator.init()).resolves.toBeUndefined()

    separator.dispose()
  })

  it('reports download and segment progress without settling the request', async () => {
    vi.stubGlobal(
      'Worker',
      fakeWorker([
        [
          { type: 'download', loaded: 1, total: 4 },
          { type: 'download', loaded: 4, total: 4 },
          { type: 'ready' },
        ],
        [
          { type: 'progress', completed: 1, total: 2 },
          { type: 'progress', completed: 2, total: 2 },
          { type: 'done', stems },
        ],
      ]),
    )
    const onDownload = vi.fn()
    const onProgress = vi.fn()
    const separator = new Separator({ onDownload, onProgress })

    const result = await separator.separate(new Float32Array(1), new Float32Array(1))

    expect(onDownload.mock.calls).toEqual([
      [1, 4],
      [4, 4],
    ])
    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ])
    expect(result).toBe(stems)

    separator.dispose()
  })
})
