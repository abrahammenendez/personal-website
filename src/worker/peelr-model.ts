// `cloudflare:workers` is why this cannot sit in the experiment's own directory: the
// barrel is imported by the client too, and the client build fails to resolve it.
import { env } from 'cloudflare:workers'
import { MODEL_URL, MODEL_VERSION } from '@/lab/peelr'

/** The same content hash the URL carries, so the two cannot drift apart. */
const MODEL_KEY = `peelr/htdemucs-split-${MODEL_VERSION}.onnx`

/**
 * Streams peelr's ONNX model out of R2.
 *
 * It cannot ship as a static asset: Cloudflare caps an individual asset at 25 MiB and
 * the model is several times that. Streaming costs no measurable CPU against the
 * Worker's 10 ms budget, because time spent waiting on storage does not count.
 */
export async function servePeelrModel(request: Request): Promise<Response | undefined> {
  if (new URL(request.url).pathname !== MODEL_URL) return undefined

  const object = await env.PEELR_MODELS.get(MODEL_KEY)
  if (!object) {
    return new Response(`model not found at ${MODEL_KEY}`, { status: 503 })
  }

  return new Response(object.body, {
    headers: {
      'content-type': 'application/octet-stream',
      // The client shows a progress bar, which needs a length to divide by.
      'content-length': String(object.size),
      etag: object.httpEtag,
      // Safe indefinitely: the key carries the model's content hash, so a new export is
      // a new URL. See `MODEL_VERSION`.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
