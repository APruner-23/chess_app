import { PHASE_LABELS } from '../chess/phase'
import { lineStats } from '../feedback/stats'
import type { FeedbackItem } from '../feedback/types'
import type { Analysis, Color, Game, Speed } from '../import/types'
import { openingKey, UNKNOWN_OPENING } from '../openings/stats'
import { MOTIF_ADVICE, MOTIF_LABELS, type Motif } from '../puzzles/motifs'
import type { Puzzle } from '../puzzles/types'
import type { Repertoire } from '../repertoire/types'
import { DAY_PARTS, filterGames, scoreAfterResult, scoreByDayPart, scoreOf } from '../stats/games'
import { errorsByPhase, timeStats } from '../stats/time'

export interface Insight {
  id: string
  kind: 'weakness' | 'strength'
  title: string
  detail: string
  /**
   * Estimated points lost per 100 games (weaknesses) or gained (strengths). A rough
   * figure that ranks the insights, shown as high / medium / low impact.
   */
  cost: number
  action?: { label: string; to: string }
}

export interface CoachInput {
  games: readonly Game[]
  analyses: ReadonlyMap<string, Analysis>
  puzzles: readonly Puzzle[]
  exits: readonly FeedbackItem[]
  reps: ReadonlyMap<string, Repertoire>
  openFeedback: number
  now: number
}

export interface CoachReport {
  /** The games the coach looked at: the last 12 months, or everything if too few. */
  games: number
  analyzed: number
  weaknesses: Insight[]
  strengths: Insight[]
}

/** Below this many analyzed games the error-based insights are not reliable. */
export const MIN_ANALYZED = 10
const MIN_GAMES = 50
/** A blunder weighs twice a mistake when sharing out the points lost to errors. */
const ERROR_WEIGHT = { mistake: 1, blunder: 2 }
/**
 * Share of the points the user loses that is put down to errors. A game is decided by
 * several mistakes at once, so counting each one as lost points would add up to more
 * than was ever lost: instead this budget is shared out among the motifs and phases.
 */
const ERROR_SHARE = 0.5

const SPEED_IN: Record<Speed, string> = {
  bullet: 'In bullet',
  blitz: 'In blitz',
  rapid: 'A rapid',
  classical: 'A cadenza classica',
  daily: 'Per corrispondenza',
}
const pct = (v: number) => `${Math.round(v * 100)}%`
const COLOR_WITH: Record<Color, string> = { white: 'Col Bianco', black: 'Col Nero' }

export function impact(cost: number): 'alto' | 'medio' | 'basso' {
  return cost >= 5 ? 'alto' : cost >= 2 ? 'medio' : 'basso'
}

/** Ranks what costs the user the most points, each with something to do about it. */
export function coachReport(input: CoachInput): CoachReport {
  const recent = filterGames(input.games, { months: 12 }, input.now)
  const games = recent.length >= MIN_GAMES ? recent : [...input.games]
  const ids = new Set(games.map((g) => g.id))
  const analyzedGames = games.filter((g) => input.analyses.has(g.id))
  const total = games.length
  const out: Insight[] = []
  const strengths: Insight[] = []
  if (total === 0) return { games: 0, analyzed: 0, weaknesses: [], strengths: [] }
  const overall = scoreOf(games.map((g) => g.result)).score!

  // Time: per cadence with a clock and enough games.
  const speeds = new Map<Speed, Game[]>()
  for (const g of games)
    if (g.speed !== 'daily') speeds.set(g.speed, [...(speeds.get(g.speed) ?? []), g])
  for (const [speed, list] of speeds) {
    if (list.length < 30) continue
    const t = timeStats(list, input.analyses)
    const share = list.length / total
    if (t.losses >= 5 && t.lostOnTime / list.length >= 0.05) {
      const first = t.perMove[0]
      out.push({
        id: `time-losses-${speed}`,
        kind: 'weakness',
        title: `${SPEED_IN[speed]} perdi per tempo il ${pct(t.lostOnTime / t.losses)} delle sconfitte`,
        detail:
          `${t.lostOnTime} partite perse per tempo su ${list.length}.` +
          (first?.user !== undefined && first.opp !== undefined
            ? ` Nelle prime 10 mosse usi ${first.user.toFixed(1)} s a mossa, gli avversari ${first.opp.toFixed(1)} s: un repertorio ripassato fa risparmiare tempo.`
            : ''),
        cost: (t.lostOnTime / list.length) * 100 * 0.5 * share,
        action: { label: 'Vedi il tempo', to: `/statistiche?speed=${speed}` },
      })
    }
    const { low, ok } = t.lowClock
    if (
      low.games >= 10 &&
      ok.score !== undefined &&
      low.score !== undefined &&
      ok.score - low.score >= 0.15
    ) {
      out.push({
        id: `zeitnot-${speed}`,
        kind: 'weakness',
        title: `${SPEED_IN[speed]}, quando finisci in zeitnot fai il ${pct(low.score)} dei punti (altrimenti ${pct(ok.score)})`,
        detail: `Succede in ${low.games} partite su ${list.length}. Gioca più in fretta le mosse note e tieni almeno il 20% del tempo per il finale.`,
        cost: (ok.score - low.score) * (low.games / list.length) * 100 * share,
        action: { label: 'Vedi il tempo', to: `/statistiche?speed=${speed}` },
      })
    }
  }

  // Points lost per 100 games that are put down to errors, shared out below.
  const errorBudget = (1 - overall) * 100 * ERROR_SHARE

  // Tactical themes, from the puzzles of these games. "Positional" is what no theme
  // explains: not something to train as such.
  const puzzles = input.puzzles.filter((p) => ids.has(p.gameId))
  if (analyzedGames.length >= MIN_ANALYZED && puzzles.length >= 5) {
    const weight = (list: readonly Puzzle[]) =>
      list.reduce((a, p) => a + ERROR_WEIGHT[p.judgment], 0)
    const totalWeight = weight(puzzles)
    const byMotif = new Map<Motif, Puzzle[]>()
    for (const p of puzzles) byMotif.set(p.motif, [...(byMotif.get(p.motif) ?? []), p])
    for (const [motif, list] of byMotif) {
      const share = list.length / puzzles.length
      if (motif === 'other' || list.length < 3 || share < 0.08) continue
      out.push({
        id: `motif-${motif}`,
        kind: 'weakness',
        title: `${MOTIF_LABELS[motif]}: il ${pct(share)} dei tuoi errori`,
        detail: `${list.length} errori in ${analyzedGames.length} partite analizzate. Consiglio: ${MOTIF_ADVICE[motif]}.`,
        cost: errorBudget * (weight(list) / totalWeight),
        action: { label: 'Allenati su questo tema', to: `/puzzle?mode=practice&motif=${motif}` },
      })
    }
  }

  // Phases: one much worse than the middlegame. Its cost is the share of all errors
  // that it adds beyond the middlegame rate.
  if (analyzedGames.length >= MIN_ANALYZED) {
    const phases = errorsByPhase(games, input.analyses)
    const mid = phases.find((p) => p.phase === 'middlegame')!
    const allErrors = phases.reduce((a, p) => a + ((p.errorsPer100 ?? 0) * p.moves) / 100, 0)
    for (const p of phases) {
      if (p.phase === 'middlegame' || p.moves < 100 || !mid.errorsPer100 || !p.errorsPer100)
        continue
      const ratio = p.errorsPer100 / mid.errorsPer100
      if (ratio < 1.3) continue
      const extra = ((p.errorsPer100 - mid.errorsPer100) / 100) * p.moves
      out.push({
        id: `phase-${p.phase}`,
        kind: 'weakness',
        title: `${p.phase === 'endgame' ? 'Nei finali' : 'In apertura'} sbagli ${ratio.toFixed(1)} volte più che nel mediogioco`,
        detail: `${p.errorsPer100.toFixed(1)} errori ogni 100 mosse in ${PHASE_LABELS[p.phase].toLowerCase()}, ${mid.errorsPer100.toFixed(1)} nel mediogioco.`,
        cost: allErrors ? errorBudget * (extra / allErrors) : 0,
        action:
          p.phase === 'endgame'
            ? { label: 'Puzzle di finale', to: '/puzzle?mode=practice&phase=endgame' }
            : { label: 'Ripassa i repertori', to: '/allenamento' },
      })
    }
  }

  // Openings: families clearly below (or above) the user's average.
  for (const color of ['white', 'black'] as const) {
    const fam = new Map<string, Game[]>()
    for (const g of games) {
      if (g.userColor !== color) continue
      const name = openingKey(g, 'family')
      if (name === UNKNOWN_OPENING) continue
      fam.set(name, [...(fam.get(name) ?? []), g])
    }
    for (const [name, list] of fam) {
      if (list.length < 10) continue
      const s = scoreOf(list.map((g) => g.result)).score!
      const cost = (list.length / total) * Math.abs(overall - s) * 100
      const rep = [...input.reps.values()].find((r) => r.color === color)
      if (s <= overall - 0.1) {
        out.push({
          id: `opening-${color}-${name}`,
          kind: 'weakness',
          title: `${COLOR_WITH[color]}, nell'apertura «${name}» fai il ${pct(s)} (media ${pct(overall)})`,
          detail: `${list.length} partite. Prepara una linea solida o cambia apertura.`,
          cost,
          action: rep
            ? { label: 'Apri il repertorio', to: `/repertori/${rep.id}` }
            : { label: 'Crea un repertorio', to: '/repertori' },
        })
      } else if (s >= overall + 0.1) {
        strengths.push({
          id: `opening-${color}-${name}`,
          kind: 'strength',
          title: `${COLOR_WITH[color]}, nell'apertura «${name}» fai il ${pct(s)}`,
          detail: `${list.length} partite, sopra la tua media del ${pct(overall)}.`,
          cost,
          action: { label: 'Vedi le partite', to: `/partite?opening=${encodeURIComponent(name)}` },
        })
      }
    }
  }

  // Repertoire lines that leave the user worse off.
  const byId = new Map(input.games.map((g) => [g.id, g]))
  const exits = input.exits.filter((f) => ids.has(f.gameId))
  for (const l of lineStats(exits, byId, input.reps)) {
    if (l.games < 3 || l.avgExit === undefined || l.avgExit > -0.5) continue
    out.push({
      id: `line-${l.repertoireId}-${l.name}`,
      kind: 'weakness',
      title: `La linea «${l.name}» ti lascia in svantaggio`,
      detail: `In media ${l.avgExit.toFixed(2)} quando finisce la preparazione, su ${l.games} partite: rivedi la mossa dove esci dal libro.`,
      cost: (l.games / total) * 100 * 0.3,
      action: { label: 'Apri il repertorio', to: `/repertori/${l.repertoireId}` },
    })
  }

  // Tilt and time of day.
  const tilt = scoreAfterResult(games)
  if (
    tilt.loss.games >= 15 &&
    tilt.first.score !== undefined &&
    tilt.loss.score! <= tilt.first.score - 0.08
  ) {
    out.push({
      id: 'tilt',
      kind: 'weakness',
      title: `Dopo una sconfitta il tuo punteggio scende al ${pct(tilt.loss.score!)}`,
      detail: `Nella prima partita di una sessione fai il ${pct(tilt.first.score)}. Dopo una sconfitta fai una pausa di qualche minuto, o chiudi la sessione dopo due di fila.`,
      cost: (tilt.loss.games / total) * (tilt.first.score - tilt.loss.score!) * 100,
    })
  }
  const parts = scoreByDayPart(games)
  for (const [i, p] of parts.entries()) {
    if (p.s.games < 15 || p.s.score! > overall - 0.1) continue
    out.push({
      id: `daypart-${i}`,
      kind: 'weakness',
      title: `${DAY_PARTS[i]!.split(' ')[0]} rendi meno: ${pct(p.s.score!)} dei punti`,
      detail: `${p.s.games} partite in quella fascia, contro una media del ${pct(overall)}. Se puoi, gioca le partite che contano in altri orari.`,
      cost: (p.s.games / total) * (overall - p.s.score!) * 100,
    })
  }

  if (input.openFeedback > 0) {
    out.push({
      id: 'feedback',
      kind: 'weakness',
      title: `${input.openFeedback} ${input.openFeedback === 1 ? 'punto da sistemare' : 'punti da sistemare'} nei repertori`,
      detail:
        'Deviazioni e buchi trovati nelle tue partite: ognuno è una posizione in cui eri impreparato.',
      cost: Math.min(3, input.openFeedback * 0.3),
      action: { label: 'Apri il feedback', to: '/feedback' },
    })
  }

  return {
    games: total,
    analyzed: analyzedGames.length,
    weaknesses: out.filter((i) => i.cost > 0.3).sort((a, b) => b.cost - a.cost),
    strengths: strengths.sort((a, b) => b.cost - a.cost).slice(0, 3),
  }
}
