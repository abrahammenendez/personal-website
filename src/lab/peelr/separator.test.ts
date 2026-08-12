import { afterEach, describe, expect, it, vi } from 'vitest'
import { Separator } from './separator'

class TestWorker {
  private readonly listeners = new Map<string, Set<EventListener>>()
  private initAttempts = 0

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener)
  }

  postMessage(message: { type: string }) {
    if (message.type !== 'init') return
    const data =
      this.initAttempts++ === 0
        ? { type: 'error', message: 'model unavailable' }
        : { type: 'ready' }
    queueMicrotask(() => this.emit('message', new MessageEvent('message', { data })))
  }

  terminate() {}

  private emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('Separator', () => {
  it('can retry initialisation after the worker reports an error', async () => {
    vi.stubGlobal('Worker', TestWorker)
    const separator = new Separator()

    await expect(separator.init()).rejects.toThrow('model unavailable')
    await expect(separator.init()).resolves.toBeUndefined()

    separator.dispose()
  })
})
