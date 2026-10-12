import type { Color } from '../import/types'
import { RepGraph } from '../repertoire/graph'
import type { Repertoire, RepMove } from '../repertoire/types'
import { hardCards, isDue } from './cards'
import { buildLines, type Step } from './session'
import type { ReviewLogEntry, TrainingCard } from './types'

export type SessionMode = 'learn' | 'review' | 'hard'

export interface TrainingLine {
  repertoireId: string
  color: Color
  steps: Step[]
  /** Replay of the line just shown, to play from memory (no hints). */
  recall?: boolean
}

export interface SessionInput {
  repertoires: Repertoire[]
  movesByRep: Map<string, RepMove[]>
  cards: TrainingCard[]
  logs: ReviewLogEntry[]
  now: number
  /** New cards still allowed today. */
  newLimit: number
  /** Probability of meeting each card's position, used to pick new cards. */
  reach: (card: TrainingCard) => number
}

/** Picks the cards for a session and turns them into lines, repertoire by repertoire. */
export function prepareSession(mode: SessionMode, input: SessionInput): TrainingLine[] {
  let chosen: TrainingCard[]
  if (mode === 'learn') {
    chosen = input.cards
      .filter((c) => !c.fsrs)
      .sort((a, b) => input.reach(b) - input.reach(a))
      .slice(0, Math.max(0, input.newLimit))
  } else if (mode === 'review') {
    chosen = input.cards.filter((c) => isDue(c, input.now))
  } else {
    chosen = hardCards(input.cards, input.logs)
  }
  const lines: TrainingLine[] = []
  for (const rep of input.repertoires) {
    const targets = new Map(
      chosen.filter((c) => c.repertoireId === rep.id).map((c) => [c.epd, c.id]),
    )
    if (targets.size === 0) continue
    const graph = new RepGraph(input.movesByRep.get(rep.id) ?? [])
    for (const steps of buildLines(graph, targets, mode === 'learn' ? 'learn' : 'quiz')) {
      if (mode !== 'learn') {
        lines.push({ repertoireId: rep.id, color: rep.color, steps })
        continue
      }
      // Learning: first the line with its moves shown (nothing recorded), then the same
      // line from memory; that attempt is the card's first answer.
      lines.push({
        repertoireId: rep.id,
        color: rep.color,
        steps: steps.map((s) => ({ ...s, cardId: undefined })),
      })
      lines.push({
        repertoireId: rep.id,
        color: rep.color,
        steps: steps.map((s) => (s.kind === 'learn' ? { ...s, kind: 'quiz' } : s)),
        recall: true,
      })
    }
  }
  return lines
}
