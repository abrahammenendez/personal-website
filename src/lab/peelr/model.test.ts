import { describe, expect, it, vi } from 'vitest'
import { fetchModel } from './model'

const URL_UNDER_TEST = 'https://example.test/peelr/htdemucs-abc123.onnx'

function bodyOf(bytes: Uint8Array, chunkSize = 4): ReadableStream<Uint8Array> {
  let at = 0
  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.subarray(at, at + chunkSize))
      at += chunkSize
    },
  })
}

function responseOf(bytes: Uint8Array, withLength = true): Response {
  return new Response(bodyOf(bytes), {
    status: 200,
    headers: withLength ? { 'content-length': String(bytes.length) } : {},
  })
}

/** Minimal in-memory Cache Storage; jsdom provides none. */
function fakeCacheStorage(overrides: Partial<Cache> = {}) {
  const entries = new Map<string, Uint8Array>()
  const cache = {
    match: async (key: RequestInfo | URL) => {
      const hit = entries.get(String(key))
      return hit ? new Response(hit.slice().buffer as ArrayBuffer) : undefined
    },
    put: async (key: RequestInfo | URL, response: Response) => {
      entries.set(String(key), new Uint8Array(await response.arrayBuffer()))
    },
    ...overrides,
  } as unknown as Cache
  return { storage: { open: async () => cache } as unknown as CacheStorage, entries }
}

describe('fetchModel', () => {
  it('downloads the model and reports progress that ends at the total', async () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i)
    const fetchImpl = vi.fn().mockResolvedValue(responseOf(bytes))
    const progress: number[] = []
    const { storage } = fakeCacheStorage()

    const buffer = await fetchModel(URL_UNDER_TEST, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheStorage: storage,
      onProgress: (p) => progress.push(p.loaded),
    })

    expect(new Uint8Array(buffer)).toEqual(bytes)
    expect(progress).toEqual([4, 8, 12, 16])
  })

  it('serves the second visit from the cache without a network request', async () => {
    const bytes = Uint8Array.from({ length: 8 }, (_, i) => i)
    const fetchImpl = vi.fn().mockResolvedValue(responseOf(bytes))
    const { storage, entries } = fakeCacheStorage()

    await fetchModel(URL_UNDER_TEST, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheStorage: storage,
    })
    expect(entries.size).toBe(1)

    const again = await fetchModel(URL_UNDER_TEST, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheStorage: storage,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(new Uint8Array(again)).toEqual(bytes)
  })

  it('still returns the model when the cache write is rejected', async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4])
    const fetchImpl = vi.fn().mockResolvedValue(responseOf(bytes))
    const { storage } = fakeCacheStorage({
      put: async () => {
        throw new DOMException('QuotaExceededError')
      },
    })

    const buffer = await fetchModel(URL_UNDER_TEST, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheStorage: storage,
    })

    expect(new Uint8Array(buffer)).toEqual(bytes)
  })

  it('works with no Cache Storage at all', async () => {
    const bytes = Uint8Array.from([9, 9, 9])
    const fetchImpl = vi.fn().mockResolvedValue(responseOf(bytes))

    const buffer = await fetchModel(URL_UNDER_TEST, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheStorage: undefined,
    })

    expect(new Uint8Array(buffer)).toEqual(bytes)
  })

  it('reports a zero total when the server omits Content-Length', async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])
    const fetchImpl = vi.fn().mockResolvedValue(responseOf(bytes, false))
    const totals: number[] = []

    await fetchModel(URL_UNDER_TEST, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheStorage: undefined,
      onProgress: (p) => totals.push(p.total),
    })

    expect(totals.every((total) => total === 0)).toBe(true)
  })

  it('throws with the status when the download fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }))
    await expect(
      fetchModel(URL_UNDER_TEST, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        cacheStorage: undefined,
      }),
    ).rejects.toThrow(/404/)
  })
})
