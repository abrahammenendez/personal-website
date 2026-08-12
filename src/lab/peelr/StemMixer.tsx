import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export interface MixerTrack {
  name: string
  url: string
}

interface TrackState {
  volume: number
  muted: boolean
  solo: boolean
}

/** Beyond this the elements are audibly out of step, so the laggard gets pulled back. */
const MAX_DRIFT_SECONDS = 0.05
const DEFAULT_TRACK_STATE: TrackState = { volume: 1, muted: false, solo: false }

export function StemMixer({ tracks }: { tracks: MixerTrack[] }) {
  const elements = useRef<(HTMLAudioElement | null)[]>([])
  const context = useRef<AudioContext | undefined>(undefined)
  const gainNodes = useRef<GainNode[]>([])
  const [playing, setPlaying] = useState(false)
  const [starting, setStarting] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | undefined>(undefined)
  const [states, setStates] = useState<TrackState[]>(() =>
    tracks.map(() => ({ volume: 1, muted: false, solo: false })),
  )

  const anySolo = states.some((state) => state.solo)

  useEffect(() => {
    states.forEach((state, index) => {
      const audible = !state.muted && (!anySolo || state.solo)
      const gain = gainNodes.current[index]
      if (gain) gain.gain.value = audible ? state.volume : 0
    })
  }, [states, anySolo])

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      const [reference] = elements.current
      if (!reference) return
      for (const element of elements.current) {
        if (element && Math.abs(element.currentTime - reference.currentTime) > MAX_DRIFT_SECONDS) {
          element.currentTime = reference.currentTime
        }
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [playing])

  useEffect(
    () => () => {
      for (const element of elements.current) element?.pause()
      void context.current?.close()
    },
    [],
  )

  function connectAudio() {
    context.current ??= new AudioContext()
    if (gainNodes.current.length > 0) return context.current

    for (const element of elements.current) {
      if (!element) continue
      const gain = context.current.createGain()
      context.current
        .createMediaElementSource(element)
        .connect(gain)
        .connect(context.current.destination)
      gainNodes.current.push(gain)
    }
    states.forEach((state, index) => {
      const audible = !state.muted && (!anySolo || state.solo)
      const gain = gainNodes.current[index]
      if (gain) gain.gain.value = audible ? state.volume : 0
    })
    return context.current
  }

  async function toggle() {
    if (playing) {
      for (const element of elements.current) element?.pause()
      setPlaying(false)
      return
    }

    setStarting(true)
    setPlaybackError(undefined)
    const audioContext = connectAudio()
    const starts = elements.current.flatMap((element) => (element ? [element.play()] : []))
    try {
      await Promise.all([audioContext.resume(), ...starts])
      setPlaying(true)
    } catch {
      for (const element of elements.current) element?.pause()
      setPlaybackError('Playback could not start. You can still download each stem.')
    } finally {
      setStarting(false)
    }
  }

  function update(index: number, patch: Partial<TrackState>) {
    setStates((current) =>
      current.map((state, i) => (i === index ? { ...state, ...patch } : state)),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Button disabled={starting} onClick={() => void toggle()}>
        {starting ? 'Starting…' : playing ? 'Pause' : 'Play all'}
      </Button>

      {playbackError ? <p role="alert">{playbackError}</p> : null}

      <ul className="flex flex-col gap-3">
        {tracks.map((track, index) => {
          const state = states[index] ?? DEFAULT_TRACK_STATE
          return (
            <li className="flex items-center gap-3" key={track.name}>
              <span className="w-20 shrink-0 text-sm capitalize">{track.name}</span>

              {/* biome-ignore lint/a11y/useMediaCaption: The separate stems have no dialogue to transcribe. */}
              <audio
                className="sr-only"
                preload="metadata"
                ref={(element) => {
                  elements.current[index] = element
                }}
                src={track.url}
              />

              <input
                aria-label={`${track.name} volume`}
                className="w-32"
                max={1}
                min={0}
                onChange={(event) => update(index, { volume: Number(event.target.value) })}
                step={0.01}
                type="range"
                value={state.volume}
              />

              <Button
                aria-pressed={state.solo}
                onClick={() => update(index, { solo: !state.solo })}
                size="sm"
                variant={state.solo ? 'default' : 'outline'}
              >
                Solo
              </Button>
              <Button
                aria-pressed={state.muted}
                onClick={() => update(index, { muted: !state.muted })}
                size="sm"
                variant={state.muted ? 'default' : 'outline'}
              >
                Mute
              </Button>

              <a className="text-sm underline" download={`${track.name}.wav`} href={track.url}>
                Download
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
