import { describe, expect, it } from 'vitest'
import reference from './__fixtures__/reference.json'
import { SAMPLE_RATE, SEGMENT_SAMPLES } from './constants'
import { demucsIspec, demucsSpec, hannWindow, reflectPad, stft } from './fft'

/**
 * Mirrors `signal()` in the fixture generator. Defined by formula in both languages so
 * the input never has to be committed.
 */
function signal(channel: 0 | 1, n = SEGMENT_SAMPLES): Float32Array {
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const base =
      channel === 0
        ? 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) +
          0.25 * Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE) +
          0.1 * Math.sin((2 * Math.PI * 7000 * i) / SAMPLE_RATE + 1)
        : 0.4 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE + 0.5) +
          0.3 * Math.sin((2 * Math.PI * 3000 * i) / SAMPLE_RATE)
    const chirp = 0.2 * Math.sin((2 * Math.PI * (100 + (5000 * i) / n) * i) / SAMPLE_RATE)
    x[i] = base + chirp + (i >= 10000 && i < 10010 ? 0.8 : 0)
  }
  return x
}

interface Summary {
  len: number
  std: number
  absmax: number
}

/** `std` divides by `n`, which is what numpy's default `ddof=0` does. */
function stats(buffers: ArrayLike<number>[]): Summary {
  let len = 0
  let sum = 0
  let absmax = 0
  for (const values of buffers) {
    len += values.length
    for (let i = 0; i < values.length; i++) {
      const value = values[i] as number
      sum += value
      absmax = Math.max(absmax, Math.abs(value))
    }
  }
  const mean = sum / len
  let variance = 0
  for (const values of buffers) {
    for (let i = 0; i < values.length; i++) variance += ((values[i] as number) - mean) ** 2
  }
  return { len, std: Math.sqrt(variance / len), absmax }
}

/** Both sides come from indexed access, so both are `number | undefined` to the checker. */
function expectClose(
  actual: number | undefined,
  expected: number | undefined,
  tolerance: number,
  label: string,
) {
  expect(actual, `${label}: actual missing`).toBeTypeOf('number')
  expect(expected, `${label}: expected missing`).toBeTypeOf('number')
  const difference = Math.abs((actual as number) - (expected as number))
  expect(difference, `${label}: ${actual} vs ${expected}`).toBeLessThan(tolerance)
}

/**
 * Head and tail slices leave the middle of a 343,980-sample buffer unchecked, so every
 * comparison also goes through the whole-buffer statistics the generator recorded.
 *
 * Deviation and peak rather than mean or sum: cancellation drives the sum of a
 * spectrogram to near zero, where it would stay however wrong the values were.
 *
 * The comparison is relative, and bounded by the reference rather than by us. Fixtures
 * come from float32 tensors, so nothing here can beat that format's 1.2e-7 resolution;
 * the observed errors are 3e-15 for the signal and 5e-8 through the transforms.
 */
function expectSummary(buffers: ArrayLike<number>[], ref: Summary, label: string) {
  const got = stats(buffers)
  expect(got.len, `${label} len`).toBe(ref.len)
  for (const key of ['std', 'absmax'] as const) {
    const error = Math.abs(got[key] - ref[key]) / ref[key]
    expect(error, `${label} ${key}: ${got[key]} vs ${ref[key]}`).toBeLessThan(1e-6)
  }
}

describe('test signal', () => {
  it('reproduces the values the fixtures were generated from', () => {
    for (const channel of [0, 1] as const) {
      const ref = reference.signal[`ch${channel}`]
      const got = signal(channel)
      expectSummary([got], ref, `ch${channel}`)
      for (let i = 0; i < ref.head.length; i++) {
        expectClose(got[i], ref.head[i], 1e-6, `ch${channel} head[${i}]`)
      }
      for (let i = 0; i < ref.tail.length; i++) {
        const index = got.length - ref.tail.length + i
        expectClose(got[index], ref.tail[i], 1e-6, `ch${channel} tail[${i}]`)
      }
    }
  })
})

describe('hannWindow', () => {
  it('is periodic rather than symmetric', () => {
    const w = hannWindow(8)
    expect(w[0]).toBe(0)
    expect(w[4] as number).toBeCloseTo(1, 12)
    expect(w[1] as number).toBeCloseTo(w[7] as number, 12)
  })
})

describe('reflectPad', () => {
  it('does not repeat the edge sample', () => {
    const out = reflectPad(Float32Array.from([1, 2, 3, 4]), 2, 2)
    expect(Array.from(out)).toEqual([3, 2, 1, 2, 3, 4, 3, 2])
  })
})

describe('stft', () => {
  it('applies the 1/sqrt(nFft) scaling that normalized=True implies', () => {
    const n = 4096
    const x = new Float32Array(n * 4)
    x.fill(1)
    const spec = stft(x)
    // A constant signal puts all energy in bin 0. Without the scaling this is 64x larger.
    const dc = spec.re[2 * spec.bins]
    expect(dc).toBeGreaterThan(0)
    expect(dc).toBeLessThan(Math.sqrt(n))
  })
})

describe('demucsSpec', () => {
  it('matches the reference spectrogram shape', () => {
    const spec = demucsSpec(signal(0))
    expect([spec.frames, spec.bins]).toEqual([reference.meta.frames, reference.meta.bins])
  })

  it('matches reference values from Python Demucs', () => {
    const spec = demucsSpec(signal(0))
    const ref = reference.spec
    const { frames, bins } = spec

    // The fixture ravels a [bins, frames] tensor, so its flat index is bin-major while
    // ours is frame-major. Same data, transposed.
    const atFixtureIndex = (source: Float32Array, i: number) =>
      source[(i % frames) * bins + Math.floor(i / frames)]

    for (let i = 0; i < ref.real.head.length; i++) {
      expectClose(atFixtureIndex(spec.re, i), ref.real.head[i], 2e-3, `re[${i}]`)
      expectClose(atFixtureIndex(spec.im, i), ref.imag.head[i], 2e-3, `im[${i}]`)
    }

    // The fixture covers the stereo pair, so the summary needs both channels.
    const other = demucsSpec(signal(1))
    expectSummary([spec.re, other.re], ref.real, 'real')
    expectSummary([spec.im, other.im], ref.imag, 'imag')
  })
})

describe('demucsIspec', () => {
  it('round-trips the interior of a segment', () => {
    const x = signal(0)
    const back = demucsIspec(demucsSpec(x), x.length)
    expect(back.length).toBe(x.length)

    // The first and last few thousand samples lose full overlap-add coverage because
    // `_spec` drops two frames at each end. Demucs behaves the same way, and the
    // segment crossfade in `segments.ts` is what hides it.
    let worst = 0
    for (let i = 20000; i < x.length - 20000; i++) {
      worst = Math.max(worst, Math.abs((back[i] as number) - (x[i] as number)))
    }
    expect(worst).toBeLessThan(1e-4)
  })

  it('reproduces the reference waveform, edge artefact included', () => {
    const back = demucsIspec(demucsSpec(signal(0)), SEGMENT_SAMPLES)
    const ref = reference.ispec.ch0

    // The head is inside the damaged edge region, so matching it proves we reproduce
    // Demucs' artefact exactly rather than papering over it with a different window.
    for (let i = 0; i < ref.head.length; i++) {
      expectClose(back[i], ref.head[i], 1e-4, `ispec head[${i}]`)
    }
    for (let i = 0; i < ref.tail.length; i++) {
      expectClose(back[back.length - ref.tail.length + i], ref.tail[i], 1e-4, `ispec tail[${i}]`)
    }
    expectSummary([back], ref, 'ispec')
  })
})
