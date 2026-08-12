import { describe, expect, it, vi } from 'vitest'
import { BINS, FRAMES, SAMPLE_RATE, SEGMENT_SAMPLES, STEMS } from './constants'
import { demucsSpec, type Spectrum } from './fft'
import { type ModelInput, type ModelOutput, type RunModel, separate } from './pipeline'
import { moments } from './segments'

const SPEC_LENGTH = 4 * BINS * FRAMES
const TIME_LENGTH = 2 * SEGMENT_SAMPLES

function tone(n: number): Float32Array {
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    x[i] =
      0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) +
      0.2 * Math.sin((2 * Math.PI * 97 * i) / SAMPLE_RATE)
  }
  return x
}

/** Returns zeros, so only the plumbing is under test. */
const silentModel: RunModel = async () => ({
  freq: new Float32Array(STEMS.length * SPEC_LENGTH),
  time: new Float32Array(STEMS.length * TIME_LENGTH),
})

/** The bin-major `[4, BINS, FRAMES]` layout the model expects, before normalisation. */
function flattenBinMajor(spectrum: Spectrum): Float32Array {
  const stride = BINS * FRAMES
  const flat = new Float32Array(SPEC_LENGTH)
  for (let bin = 0; bin < BINS; bin++) {
    for (let frame = 0; frame < FRAMES; frame++) {
      const re = spectrum.re[frame * BINS + bin] as number
      const im = spectrum.im[frame * BINS + bin] as number
      const target = bin * FRAMES + frame
      flat[target] = re
      flat[stride + target] = im
      flat[2 * stride + target] = re
      flat[3 * stride + target] = im
    }
  }
  return flat
}

describe('separate', () => {
  it('rejects mismatched channel lengths', async () => {
    await expect(separate(new Float32Array(4), new Float32Array(5), silentModel)).rejects.toThrow(
      /length mismatch/,
    )
  })

  it('hands the model correctly shaped tensors', async () => {
    const seen: ModelInput[] = []
    const spy: RunModel = async (input) => {
      seen.push(input)
      return silentModel(input)
    }

    await separate(tone(100_000), tone(100_000), spy)

    expect(seen).toHaveLength(1)
    expect(seen[0]?.specNorm.length).toBe(SPEC_LENGTH)
    expect(seen[0]?.mixNorm.length).toBe(TIME_LENGTH)
  })

  it('lays the spectrogram out bin-major, the way PyTorch does', async () => {
    const total = 100_000
    const source = tone(total)
    let captured: Float32Array | undefined
    const spy: RunModel = async (input) => {
      captured = input.specNorm.slice()
      return silentModel(input)
    }

    await separate(source, source, spy)

    // Rebuild what the pipeline should have sent, then apply the same normalisation.
    const padded = new Float32Array(SEGMENT_SAMPLES)
    padded.set(source)
    const expected = flattenBinMajor(demucsSpec(padded))
    const m = moments([expected])

    for (let i = 0; i < 512; i++) {
      const want = ((expected[i] as number) - m.mean) / (1e-5 + m.std)
      expect(Math.abs((captured?.[i] as number) - want)).toBeLessThan(1e-4)
    }
  })

  it('reports progress once per segment', async () => {
    const onProgress = vi.fn()
    const total = 300_000
    await separate(tone(total), tone(total), silentModel, { onProgress })

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2)
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2)
  })

  it('returns one full-length stereo buffer per stem', async () => {
    const total = 100_000
    const stems = await separate(tone(total), tone(total), silentModel)

    expect(Object.keys(stems)).toEqual([...STEMS])
    for (const stem of Object.values(stems)) {
      expect(stem.left.length).toBe(total)
      expect(stem.right.length).toBe(total)
    }
  })

  it('keeps stems and channels in the documented order', async () => {
    const total = 100_000
    // Stem s, channel c gets the constant (s + 1) * 10 + c, straight through the time
    // branch. Any transposition of the output shows up as a swapped constant.
    const model: RunModel = async (): Promise<ModelOutput> => {
      const time = new Float32Array(STEMS.length * TIME_LENGTH)
      for (let s = 0; s < STEMS.length; s++) {
        for (let c = 0; c < 2; c++) {
          time.fill(
            (s + 1) * 10 + c,
            s * TIME_LENGTH + c * SEGMENT_SAMPLES,
            s * TIME_LENGTH + (c + 1) * SEGMENT_SAMPLES,
          )
        }
      }
      return { freq: new Float32Array(STEMS.length * SPEC_LENGTH), time }
    }

    const stems = await separate(tone(total), tone(total), model)
    const middle = Math.floor(total / 2)
    // Denormalisation adds a common offset and a positive scale, so the constants stay
    // ordered: drums below bass below other below vocals, and left below right in each.
    const lefts = STEMS.map((stem) => stems[stem].left[middle] as number)
    const rights = STEMS.map((stem) => stems[stem].right[middle] as number)

    expect(lefts).toEqual([...lefts].toSorted((a, b) => a - b))
    for (let s = 0; s < STEMS.length; s++) {
      expect(rights[s] as number).toBeGreaterThan(lefts[s] as number)
    }
  })
})
