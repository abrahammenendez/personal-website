import { BINS, CENTER_PAD, FRAME_TRIM, HOP, N_FFT, SPEC_PAD } from './constants'

/**
 * Read an element as a definite number. Every index in this file is in range by
 * construction, but `noUncheckedIndexedAccess` cannot prove it.
 *
 * `segments.ts` and `pipeline.ts` keep their own copies rather than importing this one.
 * Sharing it makes the loops here 7x slower: V8 will not inline through an ES module
 * binding, and this runs tens of millions of times per segment.
 */
const at = (values: Float32Array | Float64Array, index: number): number => values[index] as number

/** A spectrogram, stored as two flat arrays indexed `frame * bins + bin`. */
export interface Spectrum {
  re: Float32Array
  im: Float32Array
  frames: number
  bins: number
}

/**
 * In-place radix-2 Cooley-Tukey. A direct DFT is O(n²) and takes minutes per segment
 * at n = 4096; this is the difference between the feature working and not.
 */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      // Temporaries rather than destructuring: the array literal that a destructured
      // swap allocates is not free when this runs n times per frame.
      const tRe = at(re, i)
      const tIm = at(im, i)
      re[i] = at(re, j)
      im[i] = at(im, j)
      re[j] = tRe
      im[j] = tIm
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < len / 2; k++) {
        const half = i + k + len / 2
        const aRe = at(re, i + k)
        const aIm = at(im, i + k)
        const bRe = at(re, half) * curRe - at(im, half) * curIm
        const bIm = at(re, half) * curIm + at(im, half) * curRe
        re[i + k] = aRe + bRe
        im[i + k] = aIm + bIm
        re[half] = aRe - bRe
        im[half] = aIm - bIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

/** Periodic, matching `torch.hann_window(n)`, which defaults to `periodic=True`. */
export function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  return w
}

/**
 * Reflect padding, matching `mode='reflect'`: the edge sample itself is not repeated,
 * so `[a b c]` padded by 2 on the left becomes `[c b a b c]`.
 */
export function reflectPad(x: Float32Array, left: number, right: number): Float64Array {
  const n = x.length
  const out = new Float64Array(left + n + right)
  for (let i = 0; i < left; i++) out[i] = at(x, left - i)
  out.set(x, left)
  for (let i = 0; i < right; i++) out[left + n + i] = at(x, n - 2 - i)
  return out
}

/**
 * `torch.stft(n_fft, hop, hann_window(n_fft), normalized=True, center=True,
 * pad_mode='reflect')`.
 *
 * `normalized=True` scales by `1 / sqrt(n_fft)`. Omitting it leaves every value 64x
 * too large, which the model does not notice and the output does.
 */
export function stft(signal: Float32Array, nFft = N_FFT, hop = HOP): Spectrum {
  const padded = reflectPad(signal, CENTER_PAD, CENTER_PAD)
  const frames = Math.floor((padded.length - nFft) / hop) + 1
  const bins = nFft / 2 + 1
  const win = hannWindow(nFft)
  const scale = 1 / Math.sqrt(nFft)

  const re = new Float32Array(frames * bins)
  const im = new Float32Array(frames * bins)
  const bufRe = new Float64Array(nFft)
  const bufIm = new Float64Array(nFft)

  for (let f = 0; f < frames; f++) {
    const off = f * hop
    for (let i = 0; i < nFft; i++) {
      bufRe[i] = at(padded, off + i) * at(win, i)
      bufIm[i] = 0
    }
    fftInPlace(bufRe, bufIm)
    for (let b = 0; b < bins; b++) {
      re[f * bins + b] = at(bufRe, b) * scale
      im[f * bins + b] = at(bufIm, b) * scale
    }
  }
  return { re, im, frames, bins }
}

/**
 * `torch.istft(..., normalized=True, center=True, length)`.
 *
 * Overlap-adds `ifft(frame) * window`, divides by the summed window energy, then drops
 * the centre padding. The division is what makes the transform invertible.
 */
export function istft(spec: Spectrum, length: number, nFft = N_FFT, hop = HOP): Float32Array {
  const { re, im, frames, bins } = spec
  const win = hannWindow(nFft)
  const scale = Math.sqrt(nFft)
  const total = (frames - 1) * hop + nFft

  const acc = new Float64Array(total)
  const env = new Float64Array(total)
  const bufRe = new Float64Array(nFft)
  const bufIm = new Float64Array(nFft)

  for (let f = 0; f < frames; f++) {
    // Rebuild the full spectrum from the half we stored, using conjugate symmetry.
    for (let b = 0; b < bins; b++) {
      bufRe[b] = at(re, f * bins + b) * scale
      bufIm[b] = at(im, f * bins + b) * scale
    }
    for (let b = bins; b < nFft; b++) {
      bufRe[b] = at(bufRe, nFft - b)
      bufIm[b] = -at(bufIm, nFft - b)
    }
    // An inverse FFT is a forward FFT on the conjugate, conjugated and scaled.
    for (let i = 0; i < nFft; i++) bufIm[i] = -at(bufIm, i)
    fftInPlace(bufRe, bufIm)

    const off = f * hop
    for (let i = 0; i < nFft; i++) {
      const w = at(win, i)
      acc[off + i] = at(acc, off + i) + (at(bufRe, i) / nFft) * w
      env[off + i] = at(env, off + i) + w * w
    }
  }

  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const j = i + CENTER_PAD
    const e = at(env, j)
    out[i] = e > 1e-8 ? at(acc, j) / e : 0
  }
  return out
}

/**
 * `HTDemucs._spec`: reflect-pad, transform, drop the Nyquist bin, then drop two frames
 * from each end. The frame trim is why a segment's first and last few thousand samples
 * do not survive a round trip, and why the overlap-add window must weight edges down.
 */
export function demucsSpec(channel: Float32Array): Spectrum {
  const le = Math.ceil(channel.length / HOP)
  const padded = reflectPad(channel, SPEC_PAD, SPEC_PAD + le * HOP - channel.length)
  const full = stft(new Float32Array(padded))

  const frames = le
  const re = new Float32Array(frames * BINS)
  const im = new Float32Array(frames * BINS)
  for (let f = 0; f < frames; f++) {
    const src = (f + FRAME_TRIM) * full.bins
    re.set(full.re.subarray(src, src + BINS), f * BINS)
    im.set(full.im.subarray(src, src + BINS), f * BINS)
  }
  return { re, im, frames, bins: BINS }
}

/** `HTDemucs._ispec`: restore the Nyquist bin and the trimmed frames, then invert. */
export function demucsIspec(spec: Spectrum, length: number): Float32Array {
  const bins = BINS + 1
  const frames = spec.frames + 2 * FRAME_TRIM
  const re = new Float32Array(frames * bins)
  const im = new Float32Array(frames * bins)
  for (let f = 0; f < spec.frames; f++) {
    const src = f * spec.bins
    const dst = (f + FRAME_TRIM) * bins
    re.set(spec.re.subarray(src, src + spec.bins), dst)
    im.set(spec.im.subarray(src, src + spec.bins), dst)
  }
  const le = HOP * Math.ceil(length / HOP) + 2 * SPEC_PAD
  const full = istft({ re, im, frames, bins }, le)
  return full.slice(SPEC_PAD, SPEC_PAD + length)
}
