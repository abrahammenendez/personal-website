import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DEMO_TRACK, MAX_DURATION_SECONDS, SAMPLE_RATE, STEMS, type Stem } from './constants'
import { waveformPath } from './peaks'
import type { Stems } from './pipeline'
import type { StemBuffers } from './player'
import { StemMixer, type StemTrack } from './StemMixer'
import type { Separator } from './separator'
import { encodeWav } from './wav'

interface Mix {
  buffers: StemBuffers
  tracks: StemTrack[]
  title: string
}

type Phase =
  | { name: 'idle' }
  | { name: 'unsupported' }
  | { name: 'fetching' }
  | { name: 'decoding' }
  | { name: 'downloading'; loaded: number; total: number }
  | { name: 'separating'; completed: number; total: number }
  | { name: 'done'; mix: Mix }
  | { name: 'failed'; message: string }

function releaseTracks(urls: { current: string[] }) {
  for (const url of urls.current) URL.revokeObjectURL(url)
  urls.current = []
}

// `import.meta.env.SSR` folds to a constant, so the server build drops the import
// entirely and neither the worker nor ONNX Runtime reaches the Worker script.
const loadSeparator = import.meta.env.SSR
  ? () => Promise.reject(new Error('peelr runs in the browser only'))
  : () => import('./separator')

/** Decodes to 44.1 kHz stereo, the only rate the model accepts. */
async function decode(file: File): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer()
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })
  try {
    return await context.decodeAudioData(bytes)
  } finally {
    await context.close()
  }
}

/**
 * Copies the samples the model needs and lets the decoded buffer go, rather than
 * holding a second copy of the track through the separation that follows.
 */
async function decodeChannels(file: File): Promise<[Float32Array, Float32Array]> {
  const audio = await decode(file)
  if (audio.duration > MAX_DURATION_SECONDS) {
    // Rounding the real length reads as nonsense just over the limit, where a 6:01 track
    // is reported as six minutes against a six minute limit.
    throw new Error(`It is longer than the ${MAX_DURATION_SECONDS / 60} minute limit.`)
  }
  const left = new Float32Array(audio.length)
  const right = new Float32Array(audio.length)
  // `getChannelData` returns live engine memory, so copy rather than retain it.
  audio.copyFromChannel(left, 0)
  audio.copyFromChannel(right, audio.numberOfChannels > 1 ? 1 : 0)
  return [left, right]
}

/**
 * Empties `stems` as it goes. Copying all four before releasing any would hold both the
 * arrays and their copies, which is a gigabyte at the six-minute limit.
 */
function drainToPlayable(stems: Stems): Record<Stem, AudioBuffer> {
  const playable = {} as Record<Stem, AudioBuffer>
  for (const stem of STEMS) {
    const channels = stems[stem]
    const buffer = new AudioBuffer({
      length: channels.left.length,
      numberOfChannels: 2,
      sampleRate: SAMPLE_RATE,
    })
    buffer.getChannelData(0).set(channels.left)
    buffer.getChannelData(1).set(channels.right)
    channels.left = new Float32Array(0)
    channels.right = new Float32Array(0)
    playable[stem] = buffer
  }
  return playable
}

function Progress({
  label,
  detail,
  max,
  value,
}: Readonly<{ label: string; detail: ReactNode; max: number; value: number }>) {
  return (
    <p className="flex items-center gap-3">
      <span className="shrink-0">{label}</span>
      <progress
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full [&::-moz-progress-bar]:bg-foreground [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-foreground"
        max={max}
        value={value}
      />
      <span className="shrink-0 text-muted-foreground tabular-nums">{detail}</span>
    </p>
  )
}

export function Peelr() {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [dragging, setDragging] = useState(false)
  const separator = useRef<Separator | undefined>(undefined)
  const urls = useRef<string[]>([])
  /**
   * Separation outlives the component if a visitor cancels or navigates away, so every
   * step that allocates a worker or an object URL checks that its own run is still the
   * current one before it does.
   */
  const run = useRef(0)

  // `navigator` does not exist while prerendering, so the check waits for the client.
  useEffect(() => {
    if (!navigator.gpu) setPhase({ name: 'unsupported' })

    return () => {
      run.current++
      releaseTracks(urls)
      separator.current?.dispose()
    }
  }, [])

  function cancel() {
    run.current++
    separator.current?.dispose()
    separator.current = undefined
    setPhase({ name: 'idle' })
  }

  async function onFile(file: File) {
    if (!navigator.gpu) {
      setPhase({ name: 'unsupported' })
      return
    }
    const token = ++run.current
    releaseTracks(urls)
    setPhase({ name: 'decoding' })

    try {
      const [left, right] = await decodeChannels(file)
      if (run.current !== token) return

      const { Separator: Client } = await loadSeparator()
      if (run.current !== token) return
      separator.current ??= new Client({
        onDownload: (loaded, total) => setPhase({ name: 'downloading', loaded, total }),
        onProgress: (completed, total) => setPhase({ name: 'separating', completed, total }),
      })

      const stems = await separator.current.separate(left, right)
      if (run.current !== token) return

      // The session and its GPU buffers are worth more as free memory than as a warm
      // start for a second track, now that four stems are about to become resident.
      separator.current.dispose()
      separator.current = undefined

      const tracks = STEMS.map((stem) => {
        const { left: stemLeft, right: stemRight } = stems[stem]
        const url = URL.createObjectURL(encodeWav(stemLeft, stemRight))
        urls.current.push(url)
        return { stem, url, waveform: waveformPath(stemLeft, stemRight) }
      })
      const buffers = { stems: drainToPlayable(stems), original: await decode(file) }
      if (run.current !== token) return

      setPhase({
        name: 'done',
        mix: { buffers, tracks, title: file.name.replace(/\.[^.]+$/, '') },
      })
    } catch (error) {
      if (run.current !== token) return
      separator.current?.dispose()
      separator.current = undefined
      const detail = error instanceof Error ? error.message : String(error)
      setPhase({ name: 'failed', message: `Could not separate that file. ${detail}` })
    }
  }

  async function onDemoTrack() {
    const token = ++run.current
    setPhase({ name: 'fetching' })
    try {
      const response = await fetch(DEMO_TRACK.url)
      if (!response.ok) throw new Error(`The server responded ${response.status}.`)
      const file = new File([await response.blob()], DEMO_TRACK.filename)
      if (run.current !== token) return
      await onFile(file)
    } catch (error) {
      if (run.current !== token) return
      const detail = error instanceof Error ? error.message : String(error)
      setPhase({ name: 'failed', message: `Could not load the demo track. ${detail}` })
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void onFile(file)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void onFile(file)
  }

  const working = phase.name === 'downloading' || phase.name === 'separating'

  return (
    <section className="flex flex-col gap-4">
      {phase.name === 'idle' || phase.name === 'failed' ? (
        <div className="flex flex-col gap-3">
          <label
            className={cn(
              'flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors',
              dragging && 'border-foreground bg-accent',
            )}
            htmlFor="peelr-file"
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDrop={onDrop}
          >
            <span className="font-medium">Drop a song here</span>
            <span className="text-muted-foreground text-note">
              Up to {MAX_DURATION_SECONDS / 60} minutes. The first run downloads the model, about 90
              MB.
            </span>
            <input
              accept="audio/*"
              className="sr-only"
              id="peelr-file"
              onChange={onFileInput}
              type="file"
            />
          </label>

          {/* Outside the label: a button inside it would open the file picker too. */}
          <Button
            className="self-center"
            onClick={() => void onDemoTrack()}
            size="sm"
            variant="outline"
          >
            Try a demo track
          </Button>
        </div>
      ) : null}

      <output className="flex flex-col gap-2 text-note">
        {phase.name === 'unsupported' ? (
          <p>This needs WebGPU in Chrome or Edge. Firefox and Safari are not supported yet.</p>
        ) : null}
        {phase.name === 'fetching' ? <p>Fetching the demo track…</p> : null}
        {phase.name === 'decoding' ? <p>Reading the file…</p> : null}
        {phase.name === 'downloading' ? (
          <Progress
            detail={phase.total > 0 ? `${Math.round((phase.loaded / phase.total) * 100)}%` : null}
            label="Downloading the model"
            max={phase.total}
            value={phase.loaded}
          />
        ) : null}
        {phase.name === 'separating' ? (
          <>
            <Progress
              detail={`${phase.completed} of ${phase.total}`}
              label="Separating"
              max={phase.total}
              value={phase.completed}
            />
            <p className="text-muted-foreground">Keep this tab open.</p>
          </>
        ) : null}
        {phase.name === 'failed' ? <p>{phase.message}</p> : null}
      </output>

      {working ? (
        <Button className="self-start" onClick={cancel} size="sm" variant="outline">
          Cancel
        </Button>
      ) : null}

      {phase.name === 'done' ? (
        <>
          <StemMixer
            buffers={phase.mix.buffers}
            title={phase.mix.title}
            tracks={phase.mix.tracks}
          />
          <Button
            onClick={() => {
              releaseTracks(urls)
              setPhase({ name: 'idle' })
            }}
            variant="outline"
          >
            Separate another
          </Button>
        </>
      ) : null}

      {/* The weights are MIT licensed and this site redistributes them, so the notice
          has to travel with them. */}
      <p className="text-meta text-muted-foreground">
        Model:{' '}
        <a
          className="underline"
          href="https://github.com/adefossez/demucs"
          rel="noopener noreferrer"
          target="_blank"
        >
          Demucs
        </a>{' '}
        (htdemucs), copyright Meta Platforms, Inc., MIT licensed. Its weights are converted to ONNX
        and served from this site. Export, transforms and WebGPU pipeline made by me (with help from
        Claude).
      </p>
    </section>
  )
}
