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

function stats(a: ArrayLike<number>) {
  let sum = 0
  let absmax = 0
  for (let i = 0; i < a.length; i++) {
    const v = a[i] as number
    sum += v
    absmax = Math.max(absmax, Math.abs(v))
  }
  const mean = sum / a.length
  let variance = 0
  for (let i = 0; i < a.length; i++) variance += ((a[i] as number) - mean) ** 2
  return { mean, std: Math.sqrt(variance / a.length), absmax, sum }
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

describe('test signal', () => {
  it('reproduces the values the fixtures were generated from', () => {
    for (const channel of [0, 1] as const) {
      const ref = reference.signal[`ch${channel}`]
      const got = signal(channel)
      expect(got.length).toBe(ref.len)
      for (let i = 0; i < ref.head.length; i++) {
        expectClose(got[i], ref.head[i], 1e-6, `ch${channel} head[${i}]`)
      }
      for (let i = 0; i < ref.tail.length; i++) {
        const at = got.length - ref.tail.length + i
        expectClose(got[at], ref.tail[i], 1e-6, `ch${channel} tail[${i}]`)
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

    expectClose(stats(spec.re).absmax, ref.real.absmax, 1e-2, 'real absmax')
    expectClose(stats(spec.im).absmax, ref.imag.absmax, 1e-2, 'imag absmax')
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
    expectClose(stats(back).absmax, ref.absmax, 1e-3, 'ispec absmax')
  })
})
