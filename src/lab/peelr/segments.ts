import { SEGMENT_OVERLAP, SEGMENT_SAMPLES, STEMS, TRANSITION_POWER } from './constants'

/** A local copy on purpose. `fft.ts` explains what importing it costs. */
const at = (values: Float32Array | Float64Array, index: number): number => values[index] as number

/** `int((1 - overlap) * segment_length)` in `apply.py`. */
export const SEGMENT_STRIDE = Math.floor((1 - SEGMENT_OVERLAP) * SEGMENT_SAMPLES)

export interface StereoBuffer {
  left: Float32Array
  right: Float32Array
}

/** Mean and standard deviation, kept so the outputs can be returned to the input scale. */
export interface Moments {
  mean: number
  std: number
}

/** `offsets = range(0, length, stride)`. */
export function segmentOffsets(totalSamples: number): number[] {
  const offsets: number[] = []
  for (let offset = 0; offset < totalSamples; offset += SEGMENT_STRIDE) offsets.push(offset)
  return offsets
}

/**
 * The final segment is short rather than padded, and Demucs weights only the samples it
 * actually has (`weight[:chunk_length]`).
 *
 * Our exported model has a fixed input size, so the caller must zero-pad the chunk up to
 * `SEGMENT_SAMPLES` before inference and trim the output back to this length afterwards.
 * That is exactly what `HTDemucs.forward` does internally via `length_pre_pad`.
 */
export function segmentLengthAt(offset: number, totalSamples: number): number {
  return Math.min(SEGMENT_SAMPLES, totalSamples - offset)
}

/**
 * `apply.py`'s crossfade: a triangle peaking mid-segment, normalised by its maximum and
 * raised to `transition_power`.
 *
 * It is not an arbitrary choice. A segment's first and last few thousand samples survive
 * the STFT round trip poorly, because `_spec` drops two frames at each end, so the window
 * has to weight precisely those samples toward zero. See `fft.ts`.
 */
export function triangleWindow(
  segmentLength: number = SEGMENT_SAMPLES,
  transitionPower: number = TRANSITION_POWER,
): Float64Array {
  const half = Math.floor(segmentLength / 2)
  const weight = new Float64Array(segmentLength)
  for (let i = 0; i < half; i++) weight[i] = i + 1
  for (let i = half; i < segmentLength; i++) weight[i] = segmentLength - i
  const max = Math.max(half, segmentLength - half)
  for (let i = 0; i < segmentLength; i++) weight[i] = (at(weight, i) / max) ** transitionPower
  return weight
}

export interface Accumulator {
  stems: StereoBuffer[]
  weights: Float32Array
  totalSamples: number
}

export function createAccumulator(
  totalSamples: number,
  stemCount: number = STEMS.length,
): Accumulator {
  return {
    stems: Array.from({ length: stemCount }, () => ({
      left: new Float32Array(totalSamples),
      right: new Float32Array(totalSamples),
    })),
    weights: new Float32Array(totalSamples),
    totalSamples,
  }
}

/**
 * Adds one segment's stems into the running total, weighted by the crossfade.
 *
 * `stems` must already be trimmed to `length`. The window is accumulated once per
 * segment rather than once per stem, since every stem shares it.
 */
export function accumulateSegment(
  accumulator: Accumulator,
  offset: number,
  stems: StereoBuffer[],
  length: number,
  window: Float64Array,
): void {
  for (let s = 0; s < stems.length; s++) {
    const source = stems[s] as StereoBuffer
    const target = accumulator.stems[s] as StereoBuffer
    for (let i = 0; i < length; i++) {
      const w = at(window, i)
      target.left[offset + i] = at(target.left, offset + i) + at(source.left, i) * w
      target.right[offset + i] = at(target.right, offset + i) + at(source.right, i) * w
    }
  }
  for (let i = 0; i < length; i++) {
    accumulator.weights[offset + i] = at(accumulator.weights, offset + i) + at(window, i)
  }
}

/** `out /= sum_weight`. Demucs asserts the weight is never zero; we fall back instead. */
export function finaliseAccumulator(accumulator: Accumulator): StereoBuffer[] {
  const { stems, weights, totalSamples } = accumulator
  for (const stem of stems) {
    for (let i = 0; i < totalSamples; i++) {
      const w = at(weights, i)
      if (w > 0) {
        stem.left[i] = at(stem.left, i) / w
        stem.right[i] = at(stem.right, i) / w
      }
    }
  }
  return stems
}

/**
 * Mean and standard deviation across every channel, matching `torch.std`, which defaults
 * to the **unbiased** estimator and divides by `n - 1`. Dividing by `n` shifts every
 * normalised value the model sees, and it was trained on the `n - 1` version.
 */
export function moments(channels: Float32Array[]): Moments {
  let count = 0
  let sum = 0
  for (const channel of channels) {
    count += channel.length
    for (let i = 0; i < channel.length; i++) sum += at(channel, i)
  }
  const mean = sum / count
  let variance = 0
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) variance += (at(channel, i) - mean) ** 2
  }
  return { mean, std: Math.sqrt(variance / (count - 1)) }
}

/**
 * `(x - mean) / (epsilon + std)`.
 *
 * The model expects pre-normalised inputs because this arithmetic cannot live inside the
 * graph: the element count reaches an fp16 cast, overflows, and the whole output becomes
 * NaN. See section 11 of the plan.
 */
export function normaliseInPlace(channels: Float32Array[], m: Moments, epsilon = 1e-5): void {
  const scale = 1 / (epsilon + m.std)
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) channel[i] = (at(channel, i) - m.mean) * scale
  }
}

/** `x * std + mean`, undoing `normaliseInPlace` on the model's outputs. */
export function denormaliseInPlace(channels: Float32Array[], m: Moments, epsilon = 1e-5): void {
  const scale = epsilon + m.std
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) channel[i] = at(channel, i) * scale + m.mean
  }
}
