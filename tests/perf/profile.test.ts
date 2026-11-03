// Times the heavy pure functions on realistic data; skipped unless DATA points to a
// JSON file {games, analyses}. Run: DATA=/path/data.json npx vitest run tests/perf
import { it } from 'vitest'
import { readFileSync } from 'node:fs'
import { extractPuzzles } from '../../src/puzzles/extract'
import { coachReport } from '../../src/coach/insights'
import { factsMap, type GameFacts } from '../../src/analysis/facts'
import { compareGame } from '../../src/feedback/compareGame'
import { errorsByPhase, timeStats } from '../../src/stats/time'
import { monthlyProgress } from '../../src/stats/progress'
import { scoreAfterResult, scoreByDayPart, scoreByRatingGap, endings } from '../../src/stats/games'
import { ratingSeries, userAccuracy } from '../../src/feedback/stats'
import type { Analysis, Game } from '../../src/import/types'

it.skipIf(!process.env.DATA)('profiles', () => {
  const { games, analyses } = JSON.parse(readFileSync(process.env.DATA!, 'utf8')) as {
    games: Game[]
    analyses: Analysis[]
  }
  const amap = new Map(analyses.map((a) => [a.id, a]))
  const byId = new Map(games.map((g) => [g.id, g]))
  const time = (label: string, f: () => unknown) => {
    const t = performance.now()
    f()
    console.log(label.padEnd(28), Math.round(performance.now() - t), 'ms')
  }
  let puzzles: ReturnType<typeof extractPuzzles> = []
  time('extractPuzzles (1000)', () => {
    puzzles = analyses.flatMap((a) => extractPuzzles(byId.get(a.id)!, a))
  })
  time('compareGame (2800, no reps)', () =>
    games.forEach((g) => compareGame(g, [], amap.get(g.id))),
  )
  let facts = new Map<string, GameFacts>()
  time('factsMap (1000)', () => {
    facts = factsMap(games, amap)
  })
  time('timeStats', () => timeStats(games, facts))
  time('errorsByPhase', () => errorsByPhase(games, facts))
  time('monthlyProgress', () => monthlyProgress(games, facts, []))
  time('small stats', () => [
    scoreAfterResult(games),
    scoreByDayPart(games),
    scoreByRatingGap(games),
    endings(games),
  ])
  time('userAccuracy (1000)', () => analyses.forEach((a) => userAccuracy(byId.get(a.id)!, a)))
  time('ratingSeries x6', () =>
    ['blitz', 'bullet', 'rapid', 'blitz', 'bullet', 'rapid'].forEach((s) =>
      ratingSeries(games, 'chesscom', s as never),
    ),
  )
  time('coachReport', () =>
    coachReport({
      games,
      facts,
      puzzles,
      exits: [],
      reps: new Map(),
      openFeedback: 0,
      now: Date.now(),
    }),
  )
})
