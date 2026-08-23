/** Enough detail for a waveform a few hundred pixels wide, and a byte per bucket. */
export const PEAK_BUCKETS = 400

/**
 * Reduces a stem to one amplitude per bucket, scaled to a byte.
 *
 * Called while the sample arrays are still in hand, because `Peelr` drops them as soon
 * as they reach the player and 400 bytes per stem is what survives.
 */
export function computePeaks(left: Float32Array, right: Float32Array): Uint8Array {
  const peaks = new Uint8Array(PEAK_BUCKETS)
  if (left.length === 0) return peaks

  const bucket = left.length / PEAK_BUCKETS
  for (let i = 0; i < PEAK_BUCKETS; i++) {
    const start = Math.floor(i * bucket)
    const end = Math.max(Math.floor((i + 1) * bucket), start + 1)
    let loudest = 0
    for (let j = start; j < end && j < left.length; j++) {
      loudest = Math.max(loudest, Math.abs(left[j] ?? 0), Math.abs(right[j] ?? 0))
    }
    // Samples past full scale are legal in float audio, so the byte has to be clamped.
    peaks[i] = Math.min(Math.round(loudest * 255), 255)
  }
  return peaks
}

/**
 * The stem's waveform as one filled envelope, in a 100-tall box `PEAK_BUCKETS` wide.
 *
 * Built here rather than in the mixer because the playhead redraws every frame and the
 * path does not depend on it.
 */
export function waveformPath(left: Float32Array, right: Float32Array): string {
  const top: string[] = []
  const bottom: string[] = []
  for (const [index, peak] of computePeaks(left, right).entries()) {
    // Silence keeps a hairline, so an empty stem reads as empty rather than as missing.
    const height = Math.max((peak / 255) * 50, 0.4)
    top.push(`${index},${50 - height}`)
    bottom.unshift(`${index},${50 + height}`)
  }
  return `M${top.join('L')}L${bottom.join('L')}Z`
}
