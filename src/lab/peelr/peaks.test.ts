import { describe, expect, it } from 'vitest'
import { computePeaks, PEAK_BUCKETS, waveformPath } from './peaks'

function ramp(length: number, value: (index: number) => number): Float32Array {
  return Float32Array.from({ length }, (_, index) => value(index))
}

describe('computePeaks', () => {
  it('returns one byte per bucket whatever the input length', () => {
    for (const length of [0, 1, 7, PEAK_BUCKETS - 1, PEAK_BUCKETS * 13]) {
      expect(computePeaks(new Float32Array(length), new Float32Array(length))).toHaveLength(
        PEAK_BUCKETS,
      )
    }
  })

  it('scales full-scale audio to the top of the byte range', () => {
    const samples = ramp(PEAK_BUCKETS, () => 1)
    expect([...computePeaks(samples, samples)]).toEqual(Array(PEAK_BUCKETS).fill(255))
  })

  it('clamps samples that exceed full scale', () => {
    const samples = ramp(PEAK_BUCKETS, () => 4)
    expect(Math.max(...computePeaks(samples, samples))).toBe(255)
  })

  it('takes the loudest sample in a bucket rather than the average', () => {
    const spike = ramp(PEAK_BUCKETS * 100, (index) => (index === 50 ? 1 : 0))
    const silence = new Float32Array(spike.length)
    const peaks = computePeaks(spike, silence)

    expect(peaks[0]).toBe(255)
    expect(peaks[1]).toBe(0)
  })

  it('reads both channels', () => {
    const silence = new Float32Array(PEAK_BUCKETS)
    const loud = ramp(PEAK_BUCKETS, () => 1)

    expect(Math.max(...computePeaks(silence, loud))).toBe(255)
    expect(Math.max(...computePeaks(loud, silence))).toBe(255)
  })

  it('follows amplitude across the track', () => {
    const length = PEAK_BUCKETS * 10
    const fade = ramp(length, (index) => index / length)
    const peaks = computePeaks(fade, fade)

    expect(peaks[0]).toBeLessThan(2)
    expect(peaks[PEAK_BUCKETS - 1]).toBe(255)
    for (let i = 1; i < PEAK_BUCKETS; i++) {
      expect(peaks[i]).toBeGreaterThanOrEqual(peaks[i - 1] ?? 0)
    }
  })

  it('tolerates channels of different lengths', () => {
    expect(
      computePeaks(
        ramp(PEAK_BUCKETS, () => 1),
        new Float32Array(0),
      ),
    ).toHaveLength(PEAK_BUCKETS)
  })
})

describe('waveformPath', () => {
  it('closes a path spanning every bucket', () => {
    const samples = ramp(PEAK_BUCKETS * 4, () => 1)
    const path = waveformPath(samples, samples)

    expect(path.startsWith('M0,0')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    expect(path).toContain(`${PEAK_BUCKETS - 1},100`)
  })

  it('gives silence a visible hairline rather than a flat line', () => {
    const silence = new Float32Array(PEAK_BUCKETS)
    expect(waveformPath(silence, silence)).not.toContain('50L')
  })
})
