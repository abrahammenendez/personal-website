import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export interface MixerTrack {
  name: string
  /** Object URL for a WAV blob. The audio element streams it, so it stays off the heap. */
  url: string
}

interface TrackState {
  volume: number
  muted: boolean
  solo: boolean
}

/** Beyond this the elements are audibly out of step, so the laggard gets pulled back. */
const MAX_DRIFT_SECONDS = 0.05

export function StemMixer({ tracks }: { tracks: MixerTrack[] }) {
  const elements = useRef<(HTMLAudioElement | null)[]>([])
  const gainNodes = useRef<(GainNode | undefined)[]>([])
  const [playing, setPlaying] = useState(false)
  const [states, setStates] = useState<TrackState[]>(() =>
    tracks.map(() => ({ volume: 1, muted: false, solo: false })),
  )

  const anySolo = states.some((state) => state.solo)

  /**
   * Routing through Web Audio rather than setting `element.volume` keeps gain changes
   * sample-accurate and leaves room for meters later. The context is a real external
   * resource, so it is created and torn down here.
   */
  useEffect(() => {
    const context = new AudioContext()
    const gains = elements.current.map((element) => {
      if (!element) return undefined
      const gain = context.createGain()
      context.createMediaElementSource(element).connect(gain)
      gain.connect(context.destination)
      return gain
    })
    gainNodes.current = gains
    return () => {
      void context.close()
      gainNodes.current = []
    }
  }, [])

  // Applying gain during render would fight React; this mirrors state onto the graph.
  useEffect(() => {
    states.forEach((state, index) => {
      const audible = !state.muted && (!anySolo || state.solo)
      const gain = gainNodes.current[index]
      if (gain) gain.gain.value = audible ? state.volume : 0
    })
  }, [states, anySolo])

  /** Four independent media elements drift apart; this pulls them back to the first. */
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

  function toggle() {
    const next = !playing
    setPlaying(next)
    for (const element of elements.current) {
      if (!element) continue
      if (next) void element.play()
      else element.pause()
    }
  }

  function update(index: number, patch: Partial<TrackState>) {
    setStates((current) =>
      current.map((state, i) => (i === index ? { ...state, ...patch } : state)),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={toggle}>{playing ? 'Pause' : 'Play all'}</Button>

      <ul className="flex flex-col gap-3">
        {tracks.map((track, index) => {
          const state = states[index] ?? { volume: 1, muted: false, solo: false }
          return (
            <li className="flex items-center gap-3" key={track.name}>
              <span className="w-20 shrink-0 text-sm capitalize">{track.name}</span>

              <audio
                className="sr-only"
                preload="auto"
                ref={(element) => {
                  elements.current[index] = element
                }}
                src={track.url}
              >
                <track kind="captions" />
              </audio>

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
