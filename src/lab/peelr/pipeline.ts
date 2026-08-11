import { BINS, FRAMES, SEGMENT_SAMPLES, STEMS } from './constants'
import { demucsIspec, demucsSpec, type Spectrum } from './fft'
import {
  accumulateSegment,
  createAccumulator,
  denormaliseInPlace,
  finaliseAccumulator,
  moments,
  normaliseInPlace,
  type StereoBuffer,
  segmentLengthAt,
  segmentOffsets,
  triangleWindow,
} from './segments'

/** Channel order is `[left.real, left.imag, right.real, right.imag]`, from `_magnitude`. */
const SPEC_CHANNELS = 4

export interface ModelInput {
  /** `[1, 4, 2048, 336]`, already normalised. Bin-major, as PyTorch lays it out. */
  specNorm: Float32Array
  /** `[1, 2, 343980]`, already normalised. */
  mixNorm: Float32Array
}

export interface ModelOutput {
  /** `[1, 4, 4, 2048, 336]`, not denormalised. */
  freq: Float32Array
  /** `[1, 4, 2, 343980]`, not denormalised. */
  time: Float32Array
}

export type RunModel = (input: ModelInput) => Promise<ModelOutput>

export interface SeparateOptions {
  onProgress?: (completed: number, total: number) => void
  signal?: AbortSignal
}

/**
 * Our `Spectrum` is frame-major for cache locality during the transform, but PyTorch
 * lays `[C, Fr, T]` out bin-major. Feeding the model the wrong one produces a
 * transposed spectrogram, which is not an error, just noise.
 */
function writeSpecChannels(target: Float32Array, spectrum: Spectrum, channelOffset: number): void {
  const realBase = channelOffset * BINS * FRAMES
  const imagBase = (channelOffset + 1) * BINS * FRAMES
  for (let bin = 0; bin < BINS; bin++) {
    for (let frame = 0; frame < FRAMES; frame++) {
      const source = frame * BINS + bin
      target[realBase + bin * FRAMES + frame] = spectrum.re[source] as number
      target[imagBase + bin * FRAMES + frame] = spectrum.im[source] as number
    }
  }
}

/** The inverse of `writeSpecChannels`, pulling one stem's channel back out. */
function readSpecChannel(source: Float32Array, stem: number, channel: number): Spectrum {
  const stride = BINS * FRAMES
  const realBase = stem * SPEC_CHANNELS * stride + channel * 2 * stride
  const imagBase = realBase + stride
  const re = new Float32Array(stride)
  const im = new Float32Array(stride)
  for (let bin = 0; bin < BINS; bin++) {
    for (let frame = 0; frame < FRAMES; frame++) {
      const target = frame * BINS + bin
      re[target] = source[realBase + bin * FRAMES + frame] as number
      im[target] = source[imagBase + bin * FRAMES + frame] as number
    }
  }
  return { re, im, frames: FRAMES, bins: BINS }
}

/**
 * Runs one segment: transform, normalise, infer, denormalise, invert, recombine.
 *
 * The two normalisations happen here rather than inside the model because keeping them
 * in the graph makes fp16 conversion impossible. See section 11 of the plan.
 */
async function separateSegment(
  chunkLeft: Float32Array,
  chunkRight: Float32Array,
  runModel: RunModel,
): Promise<StereoBuffer[]> {
  const specLeft = demucsSpec(chunkLeft)
  const specRight = demucsSpec(chunkRight)

  const specNorm = new Float32Array(SPEC_CHANNELS * BINS * FRAMES)
  writeSpecChannels(specNorm, specLeft, 0)
  writeSpecChannels(specNorm, specRight, 2)

  const mixNorm = new Float32Array(2 * SEGMENT_SAMPLES)
  mixNorm.set(chunkLeft, 0)
  mixNorm.set(chunkRight, SEGMENT_SAMPLES)

  const specMoments = moments([specNorm])
  const mixMoments = moments([mixNorm])
  normaliseInPlace([specNorm], specMoments)
  normaliseInPlace([mixNorm], mixMoments)

  const { freq, time } = await runModel({ specNorm, mixNorm })

  denormaliseInPlace([freq], specMoments)
  denormaliseInPlace([time], mixMoments)

  return STEMS.map((_, stem) => {
    const left = demucsIspec(readSpecChannel(freq, stem, 0), SEGMENT_SAMPLES)
    const right = demucsIspec(readSpecChannel(freq, stem, 1), SEGMENT_SAMPLES)
    const timeBase = stem * 2 * SEGMENT_SAMPLES
    for (let i = 0; i < SEGMENT_SAMPLES; i++) {
      left[i] = (left[i] as number) + (time[timeBase + i] as number)
      right[i] = (right[i] as number) + (time[timeBase + SEGMENT_SAMPLES + i] as number)
    }
    return { left, right }
  })
}

/**
 * Separates a whole track.
 *
 * `runModel` is injected so the orchestration can be tested without a GPU, and so the
 * worker stays a thin shell around ONNX Runtime.
 */
export async function separate(
  left: Float32Array,
  right: Float32Array,
  runModel: RunModel,
  options: SeparateOptions = {},
): Promise<StereoBuffer[]> {
  if (left.length !== right.length) {
    throw new Error(`channel length mismatch: ${left.length} vs ${right.length}`)
  }

  const total = left.length
  const offsets = segmentOffsets(total)
  const window = triangleWindow()
  const accumulator = createAccumulator(total)

  for (let index = 0; index < offsets.length; index++) {
    options.signal?.throwIfAborted()
    const offset = offsets[index] as number
    const length = segmentLengthAt(offset, total)

    // The model's input size is fixed, so a short final chunk is zero-padded here and
    // the result trimmed back. `HTDemucs.forward` does the same internally.
    const chunkLeft = new Float32Array(SEGMENT_SAMPLES)
    const chunkRight = new Float32Array(SEGMENT_SAMPLES)
    chunkLeft.set(left.subarray(offset, offset + length))
    chunkRight.set(right.subarray(offset, offset + length))

    const stems = await separateSegment(chunkLeft, chunkRight, runModel)
    const trimmed = stems.map((stem) => ({
      left: stem.left.subarray(0, length),
      right: stem.right.subarray(0, length),
    }))

    accumulateSegment(accumulator, offset, trimmed, length, window)
    options.onProgress?.(index + 1, offsets.length)
  }

  return finaliseAccumulator(accumulator)
}
