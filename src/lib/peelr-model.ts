import { env } from 'cloudflare:workers'
import { MODEL_URL } from '@/lab/peelr'

/**
 * The R2 key. Content-addressed, so a new export is a new key and the response can be
 * cached forever without any risk of serving a stale model.
 */
const MODEL_KEY = 'peelr/htdemucs-split-fp16.onnx'

/**
 * Streams peelr's ONNX model out of R2.
 *
 * It cannot ship as a static asset: Cloudflare caps an individual asset at 25 MiB and
 * the model is 87.70 MB. Streaming costs no measurable CPU against the Worker's 10 ms
 * budget, because time spent waiting on storage does not count toward it.
 */
export async function serveModel(request: Request): Promise<Response | undefined> {
  if (new URL(request.url).pathname !== MODEL_URL) return undefined

  const object = await env.PEELR_MODELS.get(MODEL_KEY)
  if (!object) {
    return new Response(`model not found at ${MODEL_KEY}`, { status: 503 })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('content-type', 'application/octet-stream')
  headers.set('etag', object.httpEtag)
  // Safe to cache indefinitely because the key contains the model's identity.
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  // The client shows a progress bar, which needs a length to divide by.
  headers.set('content-length', String(object.size))

  return new Response(object.body, { headers })
}
