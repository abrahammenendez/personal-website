import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MAX_DURATION_SECONDS, SAMPLE_RATE, STEMS } from './constants'
import { type MixerTrack, StemMixer } from './StemMixer'
import type { Separator } from './separator'
import { encodeWav } from './wav'

type Phase =
  | { name: 'idle' }
  | { name: 'unsupported' }
  | { name: 'decoding' }
  | { name: 'downloading'; loaded: number; total: number }
  | { name: 'separating'; completed: number; total: number }
  | { name: 'done'; tracks: MixerTrack[] }
  | { name: 'failed'; message: string }

interface Decoded {
  left: Float32Array
  right: Float32Array
}

function revokeUrls(urls: string[]) {
  for (const url of urls) URL.revokeObjectURL(url)
}

// The browser-only worker and runtime stay out of the server bundle.
const loadSeparator = import.meta.env.SSR
  ? () => Promise.reject(new Error('peelr runs in the browser only'))
  : () => import('./separator')

/** Decodes to 44.1 kHz stereo, the only rate the model accepts. */
async function decode(file: File): Promise<Decoded> {
  const bytes = await file.arrayBuffer()
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })
  try {
    const audio = await context.decodeAudioData(bytes)
    if (audio.duration > MAX_DURATION_SECONDS) {
      throw new Error(
        `that track is ${Math.round(audio.duration / 60)} minutes; the limit is ${MAX_DURATION_SECONDS / 60}`,
      )
    }
    const left = new Float32Array(audio.length)
    const right = new Float32Array(audio.length)
    // `getChannelData` returns live engine memory, so copy rather than retain it.
    audio.copyFromChannel(left, 0)
    audio.copyFromChannel(right, audio.numberOfChannels > 1 ? 1 : 0)
    return { left, right }
  } finally {
    await context.close()
  }
}

export function Peelr() {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const separator = useRef<Separator | undefined>(undefined)
  const urls = useRef<string[]>([])
  const mounted = useRef(false)

  function releaseTracks() {
    revokeUrls(urls.current)
    urls.current = []
  }

  useEffect(() => {
    mounted.current = true
    if (!navigator.gpu) setPhase({ name: 'unsupported' })

    return () => {
      mounted.current = false
      revokeUrls(urls.current)
      urls.current = []
      separator.current?.dispose()
    }
  }, [])

  async function onFile(file: File) {
    if (!navigator.gpu) {
      setPhase({ name: 'unsupported' })
      return
    }
    releaseTracks()
    setPhase({ name: 'decoding' })

    try {
      const decoded = await decode(file)
      if (!mounted.current) return

      const original = encodeWav(decoded.left, decoded.right)

      const { Separator: Client } = await loadSeparator()
      if (!mounted.current) return
      separator.current ??= new Client({
        onDownload: (loaded, total) => setPhase({ name: 'downloading', loaded, total }),
        onProgress: (completed, total) => setPhase({ name: 'separating', completed, total }),
      })

      const stems = await separator.current.separate(decoded.left, decoded.right)
      if (!mounted.current) return

      // Encode to blobs immediately and drop the sample arrays. A blob can be backed by
      // disk; a Float32Array cannot, and five of them is what exhausts the tab.
      const tracks: MixerTrack[] = STEMS.map((stem) => {
        const blob = encodeWav(stems[stem].left, stems[stem].right)
        const url = URL.createObjectURL(blob)
        urls.current.push(url)
        return { name: stem, url }
      })
      const originalUrl = URL.createObjectURL(original)
      urls.current.push(originalUrl)
      tracks.push({ name: 'original', url: originalUrl })

      setPhase({ name: 'done', tracks })
    } catch (error) {
      separator.current?.dispose()
      separator.current = undefined
      if (mounted.current) {
        setPhase({
          name: 'failed',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void onFile(file)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) void onFile(file)
  }

  const canChooseFile = phase.name === 'idle' || phase.name === 'failed'

  return (
    <section className="flex flex-col gap-4">
      {canChooseFile && (
        <label
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center"
          htmlFor="peelr-file"
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <span className="font-medium">Drop a song, or choose a file</span>
          <span className="text-muted-foreground text-sm">
            Up to {MAX_DURATION_SECONDS / 60} minutes. The first run downloads about 94 MB, then
            everything happens on your device and nothing is uploaded.
          </span>
          <input
            accept="audio/*"
            className="sr-only"
            id="peelr-file"
            onChange={onFileInput}
            type="file"
          />
        </label>
      )}

      <output aria-live="polite" className="text-sm">
        {phase.name === 'unsupported' && (
          <p>This needs WebGPU in Chrome or Edge. Firefox and Safari are not supported yet.</p>
        )}
        {phase.name === 'decoding' && <p>Reading the file</p>}
        {phase.name === 'downloading' && (
          <p>
            Downloading the model
            {phase.total > 0 ? `, ${Math.round((phase.loaded / phase.total) * 100)}%` : ''}
          </p>
        )}
        {phase.name === 'separating' && (
          <p>
            Separating, segment {phase.completed} of {phase.total}. Keep this tab open.
          </p>
        )}
        {phase.name === 'failed' && (
          <p role="alert">Could not separate that file: {phase.message}</p>
        )}
      </output>

      {phase.name === 'done' && (
        <>
          <StemMixer tracks={phase.tracks} />
          <Button
            onClick={() => {
              releaseTracks()
              setPhase({ name: 'idle' })
            }}
            variant="outline"
          >
            Separate another
          </Button>
        </>
      )}
    </section>
  )
}
