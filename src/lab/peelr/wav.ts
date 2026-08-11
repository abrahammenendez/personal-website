import { SAMPLE_RATE } from './constants'

/** `WAVE_FORMAT_IEEE_FLOAT`. Format 1 would be integer PCM. */
const FORMAT_IEEE_FLOAT = 3

const BYTES_PER_SAMPLE = 4
const BITS_PER_SAMPLE = BYTES_PER_SAMPLE * 8

/**
 * 32-bit float rather than 16- or 24-bit integer, because separated stems legitimately
 * exceed plus or minus 1.0 and integer formats clamp. Demucs ships a whole
 * clipping-prevention strategy (`save_audio(clip="rescale")`) for exactly that reason;
 * writing float sidesteps it and stores what the model produced, unaltered.
 */
export function encodeWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number = SAMPLE_RATE,
): Blob {
  if (left.length !== right.length) {
    throw new Error(`channel length mismatch: ${left.length} vs ${right.length}`)
  }

  const channels = 2
  const frames = left.length
  const dataBytes = frames * channels * BYTES_PER_SAMPLE
  const blockAlign = channels * BYTES_PER_SAMPLE

  // Non-PCM formats need `cbSize` on the format chunk and a `fact` chunk carrying the
  // sample count, so the format chunk is 18 bytes here rather than the usual 16.
  const formatChunkBytes = 18
  const factChunkBytes = 4
  const headerBytes = 12 + (8 + formatChunkBytes) + (8 + factChunkBytes) + 8

  const buffer = new ArrayBuffer(headerBytes + dataBytes)
  const view = new DataView(buffer)
  let at = 0

  const ascii = (text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i))
    at += text.length
  }
  const u32 = (value: number) => {
    view.setUint32(at, value, true)
    at += 4
  }
  const u16 = (value: number) => {
    view.setUint16(at, value, true)
    at += 2
  }

  ascii('RIFF')
  u32(headerBytes - 8 + dataBytes)
  ascii('WAVE')

  ascii('fmt ')
  u32(formatChunkBytes)
  u16(FORMAT_IEEE_FLOAT)
  u16(channels)
  u32(sampleRate)
  u32(sampleRate * blockAlign)
  u16(blockAlign)
  u16(BITS_PER_SAMPLE)
  u16(0) // cbSize

  ascii('fact')
  u32(factChunkBytes)
  u32(frames)

  ascii('data')
  u32(dataBytes)

  for (let i = 0; i < frames; i++) {
    view.setFloat32(at, left[i] as number, true)
    view.setFloat32(at + 4, right[i] as number, true)
    at += 8
  }

  return new Blob([buffer], { type: 'audio/wav' })
}
