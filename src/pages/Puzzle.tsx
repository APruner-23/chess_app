import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import { PuzzleTrainer } from '../components/PuzzleTrainer'
import type { Phase } from '../chess/phase'
import { db } from '../db/schema'
import { recordPuzzle } from '../puzzles/repo'
import { recordActivity } from '../training/activityRepo'
import { practicePuzzles, scheduledPuzzles } from '../puzzles/session'
import { MOTIF_LABELS, type Motif } from '../puzzles/motifs'
import type { Puzzle as PuzzleT } from '../puzzles/types'

/**
 * A puzzle session: `?mode=review` (scheduled, answers recorded) or free practice,
 * optionally filtered with `phase` and `judgment`.
 */
export function Puzzle() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const review = params.get('mode') !== 'practice'
  const [puzzles, setPuzzles] = useState<PuzzleT[]>()

  useEffect(() => {
    let live = true
    void (async () => {
      const all = await db.puzzles.toArray()
      const progress = new Map((await db.puzzleProgress.toArray()).map((p) => [p.id, p]))
      const list = review
        ? scheduledPuzzles(all, progress, Date.now())
        : practicePuzzles(all, {
            ...(params.get('phase') ? { phase: params.get('phase') as Phase } : {}),
            ...(params.get('judgment')
              ? { judgment: params.get('judgment') as PuzzleT['judgment'] }
              : {}),
            ...(params.get('motif') ? { motif: params.get('motif') as Motif } : {}),
          })
      if (live) setPuzzles(list)
    })()
    return () => {
      live = false
    }
  }, [params, review])

  return (
    <>
      <PageHeader
        title={
          review
            ? 'Puzzle dai tuoi errori'
            : `Puzzle · ${params.get('motif') ? MOTIF_LABELS[params.get('motif') as Motif] : 'pratica libera'}`
        }
      />
      {puzzles && (
        <PuzzleTrainer
          puzzles={puzzles}
          onAnswer={(id, correct, ms) => {
            if (review) void recordPuzzle(db, id, correct, ms)
            void recordActivity(db, 'puzzles')
          }}
          onExit={() => navigate('/allenamento')}
        />
      )}
    </>
  )
}
