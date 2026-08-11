import { describe, expect, it } from 'vitest'
import { SAMPLE_RATE } from './constants'
import { encodeWav } from './wav'

function readAscii(view: DataView, at: number, length: number): string {
  let text = ''
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(at + i))
  return text
}

/** Walks the chunk list rather than assuming fixed offsets, the way a real parser does. */
function findChunk(view: DataView, id: string): { at: number; size: number } {
  let at = 12
  while (at + 8 <= view.byteLength) {
    const chunkId = readAscii(view, at, 4)
    const size = view.getUint32(at + 4, true)
    if (chunkId === id) return { at: at + 8, size }
    at += 8 + size + (size % 2)
  }
  throw new Error(`chunk ${id} not found`)
}

async function decode(blob: Blob) {
  return new DataView(await blob.arrayBuffer())
}

describe('encodeWav', () => {
  it('writes a RIFF/WAVE container whose declared size matches the payload', async () => {
    const view = await decode(encodeWav(new Float32Array(10), new Float32Array(10)))
    expect(readAscii(view, 0, 4)).toBe('RIFF')
    expect(readAscii(view, 8, 4)).toBe('WAVE')
    expect(view.getUint32(4, true)).toBe(view.byteLength - 8)
  })

  it('declares IEEE float rather than integer PCM', async () => {
    const view = await decode(encodeWav(new Float32Array(4), new Float32Array(4)))
    const fmt = findChunk(view, 'fmt ')
    expect(view.getUint16(fmt.at, true)).toBe(3)
    expect(view.getUint16(fmt.at + 14, true)).toBe(32)
    // Non-PCM formats require cbSize, so the chunk is 18 bytes rather than 16.
    expect(fmt.size).toBe(18)
    expect(findChunk(view, 'fact').size).toBe(4)
  })

  it('describes the stream correctly', async () => {
    const frames = 32
    const view = await decode(encodeWav(new Float32Array(frames), new Float32Array(frames)))
    const fmt = findChunk(view, 'fmt ')
    expect(view.getUint16(fmt.at + 2, true)).toBe(2) // channels
    expect(view.getUint32(fmt.at + 4, true)).toBe(SAMPLE_RATE)
    expect(view.getUint32(fmt.at + 8, true)).toBe(SAMPLE_RATE * 8) // byte rate
    expect(view.getUint16(fmt.at + 12, true)).toBe(8) // block align
    expect(findChunk(view, 'data').size).toBe(frames * 2 * 4)
    expect(view.getUint32(findChunk(view, 'fact').at, true)).toBe(frames)
  })

  it('round-trips values exactly, including peaks above 1.0', async () => {
    // Separated stems really do exceed unity, which is the whole reason for float output.
    const left = Float32Array.from([0, 0.5, -0.5, 1.4, -1.4])
    const right = Float32Array.from([1, -1, 0.25, -2.5, 0.125])
    const view = await decode(encodeWav(left, right))
    const data = findChunk(view, 'data')

    for (let i = 0; i < left.length; i++) {
      expect(view.getFloat32(data.at + i * 8, true)).toBe(left[i])
      expect(view.getFloat32(data.at + i * 8 + 4, true)).toBe(right[i])
    }
  })

  it('interleaves left before right', async () => {
    const view = await decode(encodeWav(Float32Array.from([1]), Float32Array.from([2])))
    const data = findChunk(view, 'data')
    expect(view.getFloat32(data.at, true)).toBe(1)
    expect(view.getFloat32(data.at + 4, true)).toBe(2)
  })

  it('rejects mismatched channel lengths', () => {
    expect(() => encodeWav(new Float32Array(4), new Float32Array(5))).toThrow(/length mismatch/)
  })
})
