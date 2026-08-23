import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STEMS } from './constants'
import { type StemBuffers, StemPlayer } from './player'

const DURATION = 180

class FakeNode {
  disconnected = false
  connect(target: unknown): unknown {
    return target
  }
  disconnect(): void {
    this.disconnected = true
  }
}

class FakeGain extends FakeNode {
  gain = {
    /** A real `GainNode` passes its input through untouched until something moves it. */
    value: 1,
    setTargetAtTime(value: number) {
      this.value = value
    },
  }
}

class FakeSource extends FakeNode {
  buffer: unknown = undefined
  loop = false
  onended: (() => void) | null = null
  startedAt: number | undefined
  stopped = false

  start(_when: number, offset: number): void {
    this.startedAt = offset
  }

  /** Real sources fire `ended` on stop, which is what the teardown order has to survive. */
  stop(): void {
    this.stopped = true
    this.onended?.()
  }
}

class FakeContext {
  static latest: FakeContext
  currentTime = 0
  state = 'running'
  destination = new FakeNode()
  sources: FakeSource[] = []
  /** In construction order: the stems bus, the original bus, then a fader per stem. */
  gains: FakeGain[] = []

  constructor() {
    FakeContext.latest = this
  }

  createGain(): FakeGain {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource()
    this.sources.push(source)
    return source
  }

  async resume(): Promise<void> {
    this.state = 'running'
  }

  async suspend(): Promise<void> {
    this.state = 'suspended'
  }

  async close(): Promise<void> {
    this.state = 'closed'
  }
}

function buffers(): StemBuffers {
  const buffer = { duration: DURATION } as AudioBuffer
  const stems = Object.fromEntries(STEMS.map((stem) => [stem, buffer]))
  return { stems, original: buffer } as StemBuffers
}

/** The sources built by the most recent `build`, one per stem plus the original. */
function live(context: FakeContext): FakeSource[] {
  return context.sources.slice(-(STEMS.length + 1))
}

let player: StemPlayer

beforeEach(() => {
  vi.stubGlobal('AudioContext', FakeContext)
  player = new StemPlayer(buffers())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StemPlayer', () => {
  it('reports the original track duration', () => {
    expect(player.duration).toBe(DURATION)
  })

  it('stays at the start, and silent, until the first play', () => {
    FakeContext.latest.currentTime = 12
    expect(player.position).toBe(0)
    expect(FakeContext.latest.sources).toHaveLength(0)
  })

  it('starts one source per stem plus the original, all from the same offset', async () => {
    await player.play()

    const sources = live(FakeContext.latest)
    expect(sources).toHaveLength(STEMS.length + 1)
    expect(sources.every((source) => source.startedAt === 0)).toBe(true)
  })

  it('advances with the context clock once playing', async () => {
    await player.play()
    FakeContext.latest.currentTime += 30

    expect(player.position).toBe(30)
  })

  it('holds its position across a pause, because the clock stops with it', async () => {
    await player.play()
    FakeContext.latest.currentTime += 30
    await player.pause()

    expect(FakeContext.latest.state).toBe('suspended')
    expect(player.position).toBe(30)
  })

  it('resumes from where it paused rather than rebuilding', async () => {
    await player.play()
    FakeContext.latest.currentTime += 30
    await player.pause()
    const built = FakeContext.latest.sources.length
    await player.play()

    expect(FakeContext.latest.sources).toHaveLength(built)
    expect(player.position).toBe(30)
  })

  it('rebuilds from the requested offset on a seek', async () => {
    await player.play()
    player.seek(90)

    expect(live(FakeContext.latest).every((source) => source.startedAt === 90)).toBe(true)
    expect(player.position).toBe(90)
  })

  it('stops and disconnects the sources it replaces', async () => {
    await player.play()
    const replaced = live(FakeContext.latest)
    player.seek(90)

    expect(replaced.every((source) => source.stopped && source.disconnected)).toBe(true)
  })

  it('does not mistake a seek for the end of the track', async () => {
    await player.play()
    player.seek(90)
    FakeContext.latest.currentTime += 10

    expect(player.position).toBe(100)
  })

  it('clamps a seek to the track', () => {
    player.seek(DURATION + 60)
    expect(player.position).toBe(DURATION)

    player.seek(-10)
    expect(player.position).toBe(0)
  })

  it('holds at the end once the sources report they finished', async () => {
    await player.play()
    for (const source of live(FakeContext.latest)) source.onended?.()
    FakeContext.latest.currentTime += 1000

    expect(player.position).toBe(DURATION)
  })

  it('stays stopped when seeking after the track finished', async () => {
    await player.play()
    for (const source of live(FakeContext.latest)) source.onended?.()
    player.seek(10)

    expect(FakeContext.latest.state).toBe('suspended')
    expect(player.position).toBe(10)
  })

  it('restarts from the beginning when played after finishing', async () => {
    await player.play()
    for (const source of live(FakeContext.latest)) source.onended?.()
    await player.play()

    expect(live(FakeContext.latest).every((source) => source.startedAt === 0)).toBe(true)
    expect(player.position).toBe(0)
  })

  it('wraps the position while looping instead of clamping', async () => {
    player.setLoop(true)
    await player.play()
    FakeContext.latest.currentTime += DURATION + 20

    expect(player.position).toBe(20)
  })

  it('applies looping to sources built later', async () => {
    player.setLoop(true)
    await player.play()

    expect(live(FakeContext.latest).every((source) => source.loop)).toBe(true)
  })

  it('monitors the stems until told otherwise', () => {
    const [stems, original] = FakeContext.latest.gains
    expect(stems?.gain.value).toBe(1)
    expect(original?.gain.value).toBe(0)
  })

  it('crossfades both buses when the monitored source changes', () => {
    const [stems, original] = FakeContext.latest.gains

    player.setSource('original')
    expect(stems?.gain.value).toBe(0)
    expect(original?.gain.value).toBe(1)

    player.setSource('stems')
    expect(stems?.gain.value).toBe(1)
    expect(original?.gain.value).toBe(0)
  })

  it('moves the fader belonging to the stem it was given', () => {
    const faders = FakeContext.latest.gains.slice(2)

    player.setStemGain('bass', 0.25)
    expect(faders[STEMS.indexOf('bass')]?.gain.value).toBe(0.25)
    expect(faders[STEMS.indexOf('drums')]?.gain.value).toBe(1)
  })

  it('closes the context when disposed', async () => {
    await player.play()
    player.dispose()

    expect(FakeContext.latest.state).toBe('closed')
    expect(live(FakeContext.latest).every((source) => source.stopped)).toBe(true)
  })
})
