import { DownloadIcon, HeadphonesIcon, PauseIcon, PlayIcon, RepeatIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { STEMS, type Stem } from './constants'
import { PEAK_BUCKETS } from './peaks'
import { type Source, type StemBuffers, StemPlayer } from './player'

export interface StemTrack {
  stem: Stem
  /** A WAV blob, held for the download link rather than for playback. */
  url: string
  /** An SVG path, from `waveformPath`. */
  waveform: string
}

interface FaderState {
  volume: number
  muted: boolean
  solo: boolean
}

const DEFAULT_FADER: FaderState = { volume: 1, muted: false, solo: false }

/** `other` is what Demucs calls the residual, which says nothing to anyone else. */
const LABELS: Record<Stem, string> = {
  drums: 'Drums',
  bass: 'Bass',
  other: 'Everything else',
  vocals: 'Vocals',
}

/** Mid lightness so one value carries both colour schemes. */
const COLOURS: Record<Stem, string> = {
  drums: 'oklch(0.68 0.16 40)',
  bass: 'oklch(0.65 0.15 265)',
  other: 'oklch(0.66 0.14 155)',
  vocals: 'oklch(0.66 0.16 320)',
}

/** Soloing anything silences everything else, which is what makes a stem auditionable. */
function isAudible(state: FaderState, anySolo: boolean): boolean {
  return !state.muted && (!anySolo || state.solo)
}

function formatTime(seconds: number): string {
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** Decorative: the seek control in the transport is what actually moves the playhead. */
function Waveform({
  waveform,
  colour,
  played,
}: Readonly<{ waveform: string; colour: string; played: number }>) {
  const shared = {
    className: 'absolute inset-0 size-full',
    preserveAspectRatio: 'none',
    viewBox: `0 0 ${PEAK_BUCKETS} 100`,
  }
  return (
    <div className="relative h-8 w-full">
      <svg aria-hidden="true" {...shared} opacity={0.25}>
        <path d={waveform} fill={colour} />
      </svg>
      {/* The played part of the stem, revealed left to right over the dimmed whole. */}
      <svg
        aria-hidden="true"
        {...shared}
        style={{ clipPath: `inset(0 ${100 - played * 100}% 0 0)` }}
      >
        <path d={waveform} fill={colour} />
      </svg>
    </div>
  )
}

export function StemMixer({
  buffers,
  tracks,
  title,
}: Readonly<{ buffers: StemBuffers; tracks: StemTrack[]; title: string }>) {
  const [player, setPlayer] = useState<StemPlayer | undefined>(undefined)
  const [faders, setFaders] = useState<Record<Stem, FaderState>>({
    drums: DEFAULT_FADER,
    bass: DEFAULT_FADER,
    other: DEFAULT_FADER,
    vocals: DEFAULT_FADER,
  })
  const [source, setSource] = useState<Source>('stems')
  const [playing, setPlaying] = useState(false)
  const [looping, setLooping] = useState(false)
  const [position, setPosition] = useState(0)
  const [scrub, setScrub] = useState<number | undefined>(undefined)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const created = new StemPlayer(buffers)
    setPlayer(created)
    return () => created.dispose()
  }, [buffers])

  useEffect(() => {
    if (!player) return
    const anySolo = STEMS.some((stem) => faders[stem].solo)
    for (const stem of STEMS) {
      const state = faders[stem]
      player.setStemGain(stem, isAudible(state, anySolo) ? state.volume : 0)
    }
  }, [player, faders])

  useEffect(() => {
    if (!player) return
    player.setSource(source)
  }, [player, source])

  useEffect(() => {
    if (!player) return
    player.setLoop(looping)
  }, [player, looping])

  useEffect(() => {
    if (!player || !playing) return
    let frame = 0
    const follow = () => {
      setPosition(player.position)
      if (player.position >= player.duration && !looping) setPlaying(false)
      frame = requestAnimationFrame(follow)
    }
    frame = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(frame)
  }, [player, playing, looping])

  if (!player) return null

  const anySolo = STEMS.some((stem) => faders[stem].solo)
  const duration = player.duration
  const shown = scrub ?? position

  async function toggle() {
    if (!player) return
    setFailed(false)
    try {
      if (playing) {
        await player.pause()
        setPlaying(false)
      } else {
        await player.play()
        setPlaying(true)
      }
    } catch {
      setFailed(true)
    }
  }

  function commitScrub() {
    if (scrub === undefined || !player) return
    player.seek(scrub)
    setPosition(scrub)
    setScrub(undefined)
  }

  /** Touching a fader means you want to hear it, so the comparison snaps back. */
  function adjust(stem: Stem, patch: Partial<FaderState>) {
    setFaders((current) => ({ ...current, [stem]: { ...current[stem], ...patch } }))
    setSource('stems')
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => void toggle()}
          size="icon"
          variant="outline"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <span className="text-meta tabular-nums">{formatTime(shown)}</span>
        <input
          aria-label="Seek"
          aria-valuetext={formatTime(shown)}
          className="min-w-0 flex-1 accent-foreground"
          max={duration}
          min={0}
          onBlur={commitScrub}
          onChange={(event) => setScrub(Number(event.target.value))}
          onKeyUp={commitScrub}
          onPointerUp={commitScrub}
          step={1}
          type="range"
          value={shown}
        />
        <span className="text-meta text-muted-foreground tabular-nums">{formatTime(duration)}</span>
        <Button
          aria-label="Loop"
          aria-pressed={looping}
          onClick={() => setLooping(!looping)}
          size="icon"
          variant={looping ? 'default' : 'outline'}
        >
          <RepeatIcon />
        </Button>
      </div>

      {failed ? (
        <p role="alert" className="text-destructive text-note">
          Playback could not start. You can still download each stem.
        </p>
      ) : null}

      {/* The faders do nothing while the original plays, so they stop looking live. */}
      <ul className={cn('flex flex-col gap-3', source === 'original' && 'opacity-60')}>
        {tracks.map((track) => {
          const state = faders[track.stem]
          const label = LABELS[track.stem]
          const audible = isAudible(state, anySolo)
          return (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1" key={track.stem}>
              <button
                aria-label={`Mute ${label}`}
                aria-pressed={state.muted}
                className="flex w-32 shrink-0 items-center gap-2 text-left"
                onClick={() => adjust(track.stem, { muted: !state.muted })}
                type="button"
              >
                <span
                  className="size-2 shrink-0 rounded-xs"
                  style={{ backgroundColor: COLOURS[track.stem], opacity: audible ? 1 : 0.3 }}
                />
                <span
                  className={cn(
                    'text-note',
                    !audible && 'text-muted-foreground',
                    state.muted && 'line-through',
                  )}
                >
                  {label}
                </span>
              </button>

              {/* Its own row on a phone, where squeezing it between the label and the
                  fader would leave nothing to look at. */}
              <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                <Waveform
                  colour={COLOURS[track.stem]}
                  played={duration > 0 ? shown / duration : 0}
                  waveform={track.waveform}
                />
              </div>

              <input
                aria-label={`${label} volume`}
                aria-valuetext={`${Math.round(state.volume * 100)}%`}
                className="min-w-0 flex-1 sm:w-20 sm:flex-none"
                max={1}
                min={0}
                onChange={(event) => adjust(track.stem, { volume: Number(event.target.value) })}
                step={0.01}
                style={{ accentColor: COLOURS[track.stem], opacity: audible ? 1 : 0.4 }}
                type="range"
                value={state.volume}
              />

              <Button
                aria-label={`Isolate ${label}`}
                aria-pressed={state.solo}
                onClick={() => adjust(track.stem, { solo: !state.solo })}
                size="icon"
                variant={state.solo ? 'default' : 'outline'}
              >
                <HeadphonesIcon />
              </Button>

              <a
                aria-label={`Download ${label}`}
                className="text-muted-foreground transition-colors hover:text-foreground"
                download={`${title} - ${label}.wav`}
                href={track.url}
              >
                <DownloadIcon className="size-4" />
              </a>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-2">
        <span className="text-meta text-muted-foreground">Listening to</span>
        {(['stems', 'original'] as const).map((option) => (
          <Button
            aria-pressed={source === option}
            key={option}
            onClick={() => setSource(option)}
            size="sm"
            variant={source === option ? 'default' : 'outline'}
          >
            {option === 'stems' ? 'Stems' : 'Original'}
          </Button>
        ))}
      </div>
    </div>
  )
}
