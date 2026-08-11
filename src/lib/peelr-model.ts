import { env } from 'cloudflare:workers'
import { MODEL_URL, MODEL_VERSION } from '@/lab/peelr'

/**
 * The R2 key, carrying the same content hash as the URL.
 *
 * Deliberately not named for its precision: the weights are fp16 but the arithmetic is
 * fp32, and a name like "fp16" invites someone to rebuild it as a whole-graph fp16
 * model, which corrupts the output on WebGPU. The hash is the identity.
 */
const MODEL_KEY = `peelr/htdemucs-split-${MODEL_VERSION}.onnx`

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
