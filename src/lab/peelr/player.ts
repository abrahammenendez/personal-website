import { STEMS, type Stem } from './constants'

export interface StemBuffers {
  stems: Record<Stem, AudioBuffer>
  original: AudioBuffer
}

/** What the mixer is monitoring: the stems it produced, or the file they came from. */
export type Source = 'stems' | 'original'

/** Long enough to swallow the click, short enough to feel instant. */
const GAIN_RAMP_SECONDS = 0.015

/**
 * Plays the stems and the original off a single clock.
 *
 * The model emits stems that already line up sample for sample, so the only thing that
 * can pull them apart is whatever plays them back. One `AudioContext` and one `start`
 * per run makes drift unrepresentable rather than merely small, which is the reason
 * this exists instead of an `<audio>` element per stem.
 */
export class StemPlayer {
  private readonly context = new AudioContext()
  private readonly faders = new Map<Stem, GainNode>()
  private readonly buses = new Map<Source, GainNode>()
  private sources: AudioBufferSourceNode[] = []
  /** Where in the track the live sources were told to begin. */
  private origin = 0
  /** `context.currentTime` when they were, which stops advancing while paused. */
  private startedAt = 0
  private ended = false
  private looping = false

  constructor(private readonly buffers: StemBuffers) {
    for (const source of ['stems', 'original'] as const) {
      const bus = this.context.createGain()
      bus.gain.value = source === 'stems' ? 1 : 0
      bus.connect(this.context.destination)
      this.buses.set(source, bus)
    }
    for (const stem of STEMS) {
      const fader = this.context.createGain()
      fader.connect(this.bus('stems'))
      this.faders.set(stem, fader)
    }
  }

  get duration(): number {
    return this.buffers.original.duration
  }

  /**
   * Seconds into the track. No sources exist before the first play, and a suspended
   * context freezes `currentTime`, so neither state needs its own bookkeeping.
   */
  get position(): number {
    if (this.sources.length === 0) return this.origin
    if (this.ended) return this.duration
    const played = this.origin + (this.context.currentTime - this.startedAt)
    return this.looping ? played % this.duration : Math.min(played, this.duration)
  }

  async play(): Promise<void> {
    if (this.sources.length === 0 || this.ended) this.build(this.ended ? 0 : this.origin)
    await this.context.resume()
  }

  async pause(): Promise<void> {
    await this.context.suspend()
  }

  /** Rebuilds the sources, because an `AudioBufferSourceNode` only ever starts once. */
  seek(seconds: number): void {
    this.build(Math.max(0, Math.min(seconds, this.duration)))
  }

  setStemGain(stem: Stem, value: number): void {
    this.ramp(this.faders.get(stem), value)
  }

  /** Crossfades the two buses, so the comparison stays sample-aligned. */
  setSource(source: Source): void {
    this.ramp(this.bus('stems'), source === 'stems' ? 1 : 0)
    this.ramp(this.bus('original'), source === 'original' ? 1 : 0)
  }

  setLoop(looping: boolean): void {
    this.looping = looping
    for (const source of this.sources) source.loop = looping
  }

  dispose(): void {
    this.teardown()
    void this.context.close()
  }

  private ramp(gain: GainNode | undefined, value: number): void {
    gain?.gain.setTargetAtTime(value, this.context.currentTime, GAIN_RAMP_SECONDS)
  }

  private bus(source: Source): GainNode {
    const bus = this.buses.get(source)
    if (!bus) throw new Error(`missing ${source} bus`)
    return bus
  }

  private build(from: number): void {
    this.teardown()
    this.ended = false
    this.origin = from
    this.startedAt = this.context.currentTime

    for (const stem of STEMS) {
      this.start(this.buffers.stems[stem], this.faders.get(stem), from)
    }
    const last = this.start(this.buffers.original, this.bus('original'), from)
    // They all end together, so one of them is enough to notice that they have. Reaching
    // the end has to suspend as a pause would, or a later seek quietly starts playing
    // again into a transport that still says it is stopped.
    if (last) {
      last.onended = () => {
        if (this.looping) return
        this.ended = true
        void this.context.suspend()
      }
    }
  }

  private start(
    buffer: AudioBuffer,
    destination: GainNode | undefined,
    from: number,
  ): AudioBufferSourceNode | undefined {
    if (!destination) return undefined
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.loop = this.looping
    source.connect(destination)
    source.start(0, from)
    this.sources.push(source)
    return source
  }

  private teardown(): void {
    for (const source of this.sources) {
      // Cleared first: `stop` fires `ended`, which would otherwise report a seek as the
      // track finishing.
      source.onended = null
      source.stop()
      source.disconnect()
    }
    this.sources = []
  }
}
