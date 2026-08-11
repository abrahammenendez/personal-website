import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/segments.json'
import { SAMPLE_RATE, SEGMENT_SAMPLES } from './constants'
import {
  accumulateSegment,
  createAccumulator,
  denormaliseInPlace,
  finaliseAccumulator,
  moments,
  normaliseInPlace,
  SEGMENT_STRIDE,
  segmentLengthAt,
  segmentOffsets,
  triangleWindow,
} from './segments'

/** Mirrors `signal()` in `seg_fixtures.py`. */
function signal(n: number): Float32Array {
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    x[i] =
      0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) +
      0.2 * Math.sin((2 * Math.PI * 97 * i) / SAMPLE_RATE)
  }
  return x
}

function expectClose(a: number | undefined, b: number | undefined, tolerance: number, l: string) {
  expect(Math.abs((a as number) - (b as number)), `${l}: ${a} vs ${b}`).toBeLessThan(tolerance)
}

/**
 * The window spans 3.5e-06 to 1.0, and the reference is float32, whose precision is
 * relative (about 1.2e-07) rather than absolute. Comparing it any other way either
 * fails at the peak or waves through real errors at the edges.
 */
function expectCloseRelative(a: number | undefined, b: number | undefined, l: string) {
  const expected = b as number
  const error = Math.abs((a as number) - expected) / Math.max(Math.abs(expected), 1e-30)
  expect(error, `${l}: ${a} vs ${b}`).toBeLessThan(1e-6)
}

describe('segmentOffsets', () => {
  it('matches the offsets apply_model uses', () => {
    expect(SEGMENT_STRIDE).toBe(fixture.meta.stride)
    expect(segmentOffsets(fixture.meta.totalSamples)).toEqual(fixture.offsets)
  })
})

describe('segmentLengthAt', () => {
  it('leaves the final segment short rather than padding it', () => {
    const total = fixture.meta.totalSamples
    const last = fixture.offsets[fixture.offsets.length - 1] as number
    expect(segmentLengthAt(0, total)).toBe(SEGMENT_SAMPLES)
    expect(segmentLengthAt(last, total)).toBe(total - last)
    expect(segmentLengthAt(last, total)).toBeLessThan(SEGMENT_SAMPLES)
  })
})

describe('triangleWindow', () => {
  // The reference weights come from a float32 tensor, so tolerances here are bounded by
  // float32 resolution rather than by our arithmetic, which runs in float64.
  it('matches the weights apply_model builds', () => {
    const w = triangleWindow()
    expect(w.length).toBe(fixture.weight.len)

    for (let i = 0; i < fixture.weight.head.length; i++) {
      expectCloseRelative(w[i], fixture.weight.head[i], `head[${i}]`)
    }
    for (let i = 0; i < fixture.weight.tail.length; i++) {
      expectCloseRelative(
        w[w.length - fixture.weight.tail.length + i],
        fixture.weight.tail[i],
        `tail[${i}]`,
      )
    }
    for (let i = 0; i < fixture.weight.mid.length; i++) {
      expectCloseRelative(w[SEGMENT_SAMPLES / 2 - 2 + i], fixture.weight.mid[i], `mid[${i}]`)
    }
  })

  it('peaks at 1 in the middle and approaches zero at both edges', () => {
    const w = triangleWindow()
    // Spreading 343,980 elements into Math.max overflows the call stack.
    let peak = 0
    for (let i = 0; i < w.length; i++) peak = Math.max(peak, w[i] as number)
    expect(peak).toBe(fixture.weight.max)
    expect(w[0]).toBeLessThan(1e-5)
    expect(w[w.length - 1]).toBeLessThan(1e-5)
  })
})

describe('overlap-add', () => {
  it('reconstructs the input when every segment is the identity', () => {
    const total = fixture.meta.totalSamples
    const source = signal(total)
    const window = triangleWindow()
    const accumulator = createAccumulator(total, 1)

    for (const offset of segmentOffsets(total)) {
      const length = segmentLengthAt(offset, total)
      const chunk = {
        left: source.slice(offset, offset + length),
        right: source.slice(offset, offset + length),
      }
      accumulateSegment(accumulator, offset, [chunk], length, window)
    }

    const [out] = finaliseAccumulator(accumulator)
    const stem = out as { left: Float32Array; right: Float32Array }

    let worst = 0
    for (let i = 0; i < total; i++) {
      worst = Math.max(worst, Math.abs((stem.left[i] as number) - (source[i] as number)))
    }
    // Demucs itself reconstructs to 1.19e-07 on this input, so the crossfade is a
    // partition of unity rather than something that merely sounds acceptable.
    expect(worst).toBeLessThan(1e-5)

    for (let i = 0; i < fixture.identityReconstruction.head.length; i++) {
      expectClose(stem.left[i], fixture.identityReconstruction.head[i], 1e-5, `head[${i}]`)
    }
  })
})

describe('moments', () => {
  it('uses the unbiased estimator that torch.std defaults to', () => {
    const n = 100_000
    const data = signal(n)
    const { std } = moments([data])

    let sum = 0
    for (let i = 0; i < n; i++) sum += data[i] as number
    const mean = sum / n
    let variance = 0
    for (let i = 0; i < n; i++) variance += ((data[i] as number) - mean) ** 2

    expectClose(std, Math.sqrt(variance / (n - 1)), 1e-12, 'unbiased')
    expect(std).not.toBeCloseTo(Math.sqrt(variance / n), 12)
  })
})

describe('normalise', () => {
  it('round-trips back to the original values', () => {
    const original = signal(50_000)
    const working = original.slice()
    const m = moments([working])

    normaliseInPlace([working], m)
    const normalised = moments([working])
    expectClose(normalised.mean, 0, 1e-6, 'normalised mean')

    denormaliseInPlace([working], m)
    let worst = 0
    for (let i = 0; i < original.length; i++) {
      worst = Math.max(worst, Math.abs((working[i] as number) - (original[i] as number)))
    }
    expect(worst).toBeLessThan(1e-6)
  })
})
