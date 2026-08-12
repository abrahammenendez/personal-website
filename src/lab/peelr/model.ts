/** Named so a stale entry can never be served: the key carries the model's content hash. */
const CACHE_NAME = 'peelr-model-v1'

export interface DownloadProgress {
  loaded: number
  /** Zero when the server sends no `Content-Length`, so callers must handle it. */
  total: number
}

export interface FetchModelOptions {
  onProgress?: (progress: DownloadProgress) => void
  /** Injected in tests. Defaults to the global implementations. */
  fetchImpl?: typeof fetch
  cacheStorage?: CacheStorage
}

/**
 * Reads a response body while reporting progress.
 *
 * `Response.arrayBuffer()` cannot report progress, and this download is large enough
 * that a visitor staring at nothing will assume the page is broken.
 */
async function readWithProgress(
  response: Response,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<ArrayBuffer> {
  const total = Number(response.headers.get('content-length') ?? 0)
  if (!response.body) return response.arrayBuffer()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress?.({ loaded, total })
  }

  const merged = new Uint8Array(loaded)
  let at = 0
  for (const chunk of chunks) {
    merged.set(chunk, at)
    at += chunk.byteLength
  }
  return merged.buffer
}

/**
 * Fetches the ONNX model, serving it from Cache Storage on later visits.
 *
 * Caching is best effort throughout. A browser can refuse to open a cache, evict the
 * entry under storage pressure, or reject the write when the quota is exceeded, and
 * none of those should stop a visitor separating a track: the cost is a repeated
 * download, not a broken feature.
 */
export async function fetchModel(
  url: string,
  options: FetchModelOptions = {},
): Promise<ArrayBuffer> {
  const { onProgress, fetchImpl = fetch, cacheStorage = globalThis.caches } = options

  const cache = await openCache(cacheStorage)
  const cached = await readCached(cache, url)
  if (cached) {
    onProgress?.({ loaded: cached.byteLength, total: cached.byteLength })
    return cached
  }

  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`model download failed: ${response.status} ${response.statusText}`)
  }

  // Clone before consuming: the body can only be read once, and a partial write must
  // never land in the cache where a later visit would treat it as a whole model.
  const forCache = cache ? response.clone() : undefined
  const buffer = await readWithProgress(response, onProgress)

  if (cache && forCache) {
    try {
      await cache.put(url, forCache)
    } catch {
      // Quota exceeded or storage disabled. The model is already in memory.
    }
  }
  return buffer
}

async function openCache(cacheStorage: CacheStorage | undefined): Promise<Cache | undefined> {
  if (!cacheStorage) return undefined
  try {
    return await cacheStorage.open(CACHE_NAME)
  } catch {
    return undefined
  }
}

async function readCached(cache: Cache | undefined, url: string): Promise<ArrayBuffer | undefined> {
  if (!cache) return undefined
  try {
    const hit = await cache.match(url)
    return hit ? await hit.arrayBuffer() : undefined
  } catch {
    return undefined
  }
}
