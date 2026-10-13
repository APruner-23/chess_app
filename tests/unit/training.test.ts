import { describe, expect, it } from 'vitest'
import { INITIAL_EPD, replaySan } from '../../src/chess/position'
import { RepGraph, makeRepMove } from '../../src/repertoire/graph'
import { reachProbabilities } from '../../src/repertoire/coverage'
import type { RepMove } from '../../src/repertoire/types'
import { Rating, SLOW_MS, gradeAnswer, schedule } from '../../src/training/fsrs'
import { cardId, hardCards, isDue, syncCards, trainingStats } from '../../src/training/cards'
import { allLines, buildLines, pathTo } from '../../src/training/session'
import type { ReviewLogEntry, TrainingCard } from '../../src/training/types'

const DAY = 86_400_000
const NOW = new Date(2026, 9, 12, 10, 0).getTime()

function line(moves: RepMove[], sans: string[]) {
  let epd = INITIAL_EPD
  for (const san of sans) {
    const order = moves.filter((m) => m.fromEpd === epd).length
    const m = makeRepMove('r', epd, san, order)!
    if (!moves.some((x) => x.id === m.id)) moves.push(m)
    epd = m.toEpd
  }
  return moves
}
const epdAfter = (sans: string[]) => replaySan(sans).epds[sans.length]!

// White: 1.e4, then 2.Nf3 against 1...c5 and 2.Nf3 against 1...e5 (then 3.Bb5 after 2...Nc6).
const moves = line(line([], ['e4', 'c5', 'Nf3']), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])
const graph = new RepGraph(moves)

describe('FSRS scheduling', () => {
  it('grades by correctness and thinking time', () => {
    expect(gradeAnswer(false, 1000)).toBe(Rating.Again)
    expect(gradeAnswer(true, 1000)).toBe(Rating.Good)
    expect(gradeAnswer(true, SLOW_MS + 1)).toBe(Rating.Hard)
  })

  it('pushes the due date out on success and brings it back on failure', () => {
    let s = schedule(undefined, Rating.Good, NOW)
    expect(s.due).toBeGreaterThan(NOW)
    let t = NOW
    for (let i = 0; i < 4; i++) {
      t = s.due
      s = schedule(s, Rating.Good, t)
    }
    expect(s.due - t).toBeGreaterThan(3 * DAY)
    const failed = schedule(s, Rating.Again, s.due)
    expect(failed.lapses).toBe(1)
    expect(failed.due - s.due).toBeLessThan(DAY)
  })
})

describe('card sync', () => {
  it('creates one card per user position with its main move', () => {
    const { put, remove } = syncCards('r', 'white', moves, [], NOW)
    expect(put.map((c) => c.san).sort()).toEqual(['Bb5', 'Nf3', 'Nf3', 'e4'])
    expect(put.find((c) => c.epd === INITIAL_EPD)!.id).toBe(cardId('r', INITIAL_EPD))
    expect(remove).toEqual([])
  })

  it('keeps unchanged cards, resets changed ones and removes stale ones', () => {
    const first = syncCards('r', 'white', moves, [], NOW).put.map((c) => ({
      ...c,
      fsrs: schedule(undefined, Rating.Good, NOW),
      introducedAt: NOW,
    }))
    const stale: TrainingCard = {
      id: 'r|gone',
      repertoireId: 'r',
      epd: 'gone',
      uci: 'a2a3',
      san: 'a3',
      updatedAt: 0,
    }
    const changed = first.map((c) => (c.san === 'Bb5' ? { ...c, uci: 'f1c4', san: 'Bc4' } : c))
    const { put, remove } = syncCards('r', 'white', moves, [...changed, stale], NOW + DAY)
    expect(put).toHaveLength(1)
    expect(put[0]!.san).toBe('Bb5')
    expect(put[0]!.fsrs).toBeUndefined()
    expect(put[0]!.introducedAt).toBeUndefined()
    expect(remove).toEqual(['r|gone'])
  })
})

describe('training lines', () => {
  it('finds the path to a position', () => {
    expect(pathTo(graph, epdAfter(['e4', 'e5', 'Nf3', 'Nc6']))!.map((m) => m.san)).toEqual([
      'e4',
      'e5',
      'Nf3',
      'Nc6',
    ])
  })

  it('groups due cards into lines, quizzing each card once', () => {
    const targets = new Map([
      [INITIAL_EPD, 'c-start'],
      [epdAfter(['e4', 'e5', 'Nf3', 'Nc6']), 'c-bb5'],
      [epdAfter(['e4', 'c5']), 'c-sicilian'],
    ])
    const lines = buildLines(graph, targets, 'quiz')
    const show = (l: (typeof lines)[number]) =>
      l.map((s) => `${s.kind === 'auto' ? '' : '?'}${s.move.san}`).join(' ')
    expect(lines.map(show)).toEqual(['?e4 e5 Nf3 Nc6 ?Bb5', 'e4 c5 ?Nf3'])
  })
})

describe('stats', () => {
  const card = (id: string, due?: number, lapses = 0): TrainingCard => ({
    id,
    repertoireId: 'r',
    epd: id,
    uci: 'e2e4',
    san: 'e4',
    updatedAt: 0,
    ...(due !== undefined
      ? { fsrs: { ...schedule(undefined, Rating.Good, NOW), due, lapses }, introducedAt: NOW - DAY }
      : {}),
  })
  const log = (cardIdValue: string, daysAgo: number, correct: boolean): ReviewLogEntry => ({
    id: `${cardIdValue}|${daysAgo}`,
    cardId: cardIdValue,
    repertoireId: 'r',
    reviewedAt: NOW - daysAgo * DAY,
    rating: correct ? 3 : 1,
    correct,
    elapsedMs: 1000,
    updatedAt: 0,
  })

  it('counts due cards, new cards, retention and streak', () => {
    const cards = [
      card('a', NOW - 1),
      card('b', NOW + 2 * DAY),
      card('c'),
      card('d', NOW + DAY / 2 - 1),
    ]
    const logs = [log('a', 0, true), log('a', 1, false), log('b', 2, true), log('b', 5, true)]
    const s = trainingStats(cards, logs, NOW)
    expect(s.dueNow).toBe(1)
    expect(s.dueByDay[0]).toBe(2)
    expect(s.dueByDay[2]).toBe(1)
    expect(s.newAvailable).toBe(1)
    expect(s.retention).toBe(0.75)
    expect(s.streak).toBe(3)
    expect(isDue(cards[0]!, NOW)).toBe(true)
  })

  it('ranks hard cards by lapses and misses', () => {
    const cards = [card('a', NOW, 0), card('b', NOW, 2), card('c', NOW, 0)]
    expect(hardCards(cards, [log('a', 1, false)]).map((c) => c.id)).toEqual(['b', 'a'])
  })
})

describe('reach probabilities', () => {
  it('weights user positions by opponent move frequency', () => {
    const afterE4 = epdAfter(['e4'])
    const reach = reachProbabilities(graph, 'white', (epd) =>
      epd === afterE4
        ? [
            { san: 'c5', games: 75 },
            { san: 'e5', games: 25 },
          ]
        : undefined,
    )
    expect(reach.get(INITIAL_EPD)).toBe(1)
    expect(reach.get(epdAfter(['e4', 'c5']))).toBeCloseTo(0.75)
    expect(reach.get(epdAfter(['e4', 'e5', 'Nf3', 'Nc6']))).toBeCloseTo(0.25)
  })
})

describe('session preparation', () => {
  it('introduces the most likely new cards first, within the daily limit', async () => {
    const { prepareSession } = await import('../../src/training/prepare')
    const cards = syncCards('r', 'white', moves, [], NOW).put
    const rep = {
      id: 'r',
      name: 'R',
      color: 'white' as const,
      experimental: false,
      createdAt: 0,
      updatedAt: 0,
    }
    const lines = prepareSession('learn', {
      repertoires: [rep],
      movesByRep: new Map([['r', moves]]),
      cards,
      logs: [],
      now: NOW,
      newLimit: 2,
      reach: (c) => (c.epd === INITIAL_EPD ? 1 : c.epd === epdAfter(['e4', 'c5']) ? 0.75 : 0.25),
    })
    const learned = lines.flatMap((l) =>
      l.steps.filter((s) => s.kind === 'learn').map((s) => s.move.san),
    )
    expect(learned.sort()).toEqual(['Nf3', 'e4'])
    expect(lines.every((l) => l.color === 'white')).toBe(true)
    // Each line is shown (no answers recorded), then replayed from memory without hints.
    const shown = lines.filter((l) => !l.recall)
    const recall = lines.filter((l) => l.recall)
    expect(recall).toHaveLength(shown.length)
    expect(shown.flatMap((l) => l.steps).every((s) => s.cardId === undefined)).toBe(true)
    expect(recall.flatMap((l) => l.steps).some((s) => s.kind === 'learn')).toBe(false)
    expect(recall.flatMap((l) => l.steps).filter((s) => s.cardId)).toHaveLength(2)
  })

  it("drills every saved line of a repertoire, quizzing all the user's moves", async () => {
    const { drillSession } = await import('../../src/training/prepare')
    const lines = allLines(graph, 'white', 'r')
    const sans = lines.map((l) => l.map((s) => s.move.san).join(' ')).sort()
    expect(sans).toEqual(['e4 c5 Nf3', 'e4 e5 Nf3 Nc6 Bb5'])
    for (const l of lines) {
      expect(l.filter((s) => s.kind === 'quiz').map((s) => s.cardId)).toEqual(
        l.filter((_, i) => i % 2 === 0).map((s) => cardId('r', s.move.fromEpd)),
      )
      expect(l.filter((_, i) => i % 2 === 1).every((s) => s.kind === 'auto')).toBe(true)
    }
    // Black: the opponent's moves are automatic, every White reply is a separate line.
    const black = new RepGraph(line(line([], ['e4', 'c6', 'd4', 'd5']), ['d4', 'd5']))
    const bl = allLines(black, 'black', 'b')
    expect(bl.map((l) => l.map((s) => s.kind).join(','))).toEqual([
      'auto,quiz,auto,quiz',
      'auto,quiz',
    ])
    const rep = {
      id: 'r',
      name: 'R',
      color: 'white' as const,
      experimental: false,
      createdAt: 0,
      updatedAt: 0,
    }
    expect(drillSession(rep, moves, () => 0)).toHaveLength(2)
  })
})
