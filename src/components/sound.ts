/**
 * Short sounds synthesized with Web Audio: no audio files to download or cache.
 * Browsers only allow audio after a user gesture; every sound here follows one
 * (a move, an answer), so the context is created on first use.
 */
export type Sound = 'move' | 'capture' | 'check' | 'correct' | 'wrong' | 'success' | 'fail'

let enabled = true
let ctx: AudioContext | undefined

export function setSoundsEnabled(on: boolean) {
  enabled = on
}

function context(): AudioContext | undefined {
  if (typeof AudioContext === 'undefined') return undefined
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** One tone: a frequency glide with a fast attack and an exponential decay. */
function tone(
  ac: AudioContext,
  {
    from,
    to = from,
    at = 0,
    dur,
    gain,
    type = 'sine',
  }: {
    from: number
    to?: number
    at?: number
    dur: number
    gain: number
    type?: OscillatorType
  },
) {
  const t = ac.currentTime + at
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, t)
  osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

/** A short filtered noise burst: the "wood" of a piece landing. */
function knock(ac: AudioContext, { freq, dur, gain }: { freq: number; dur: number; gain: number }) {
  const len = Math.floor(ac.sampleRate * dur)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  const src = ac.createBufferSource()
  src.buffer = buf
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 1.2
  const g = ac.createGain()
  g.gain.value = gain
  src.connect(filter).connect(g).connect(ac.destination)
  src.start()
}

export function playSound(sound: Sound) {
  if (!enabled) return
  const ac = context()
  if (!ac) return
  switch (sound) {
    case 'move':
      knock(ac, { freq: 900, dur: 0.07, gain: 0.9 })
      tone(ac, { from: 240, to: 140, dur: 0.06, gain: 0.25, type: 'triangle' })
      break
    case 'capture':
      knock(ac, { freq: 1500, dur: 0.09, gain: 1.1 })
      tone(ac, { from: 320, to: 120, dur: 0.09, gain: 0.3, type: 'triangle' })
      break
    case 'check':
      knock(ac, { freq: 900, dur: 0.07, gain: 0.9 })
      tone(ac, { from: 880, dur: 0.12, gain: 0.12, at: 0.03 })
      break
    case 'correct':
      tone(ac, { from: 784, dur: 0.12, gain: 0.15 })
      tone(ac, { from: 1047, dur: 0.18, gain: 0.15, at: 0.09 })
      break
    case 'wrong':
      tone(ac, { from: 180, to: 130, dur: 0.22, gain: 0.12, type: 'sawtooth' })
      break
    case 'success':
      ;[523, 659, 784, 1047].forEach((f, i) =>
        tone(ac, { from: f, dur: 0.2, gain: 0.13, at: i * 0.08 }),
      )
      break
    case 'fail':
      ;[392, 330, 262].forEach((f, i) => tone(ac, { from: f, dur: 0.22, gain: 0.12, at: i * 0.1 }))
      break
  }
}
