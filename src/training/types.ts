/** FSRS state stored as plain numbers (Unix ms) so it serializes cleanly to JSON backups. */
export interface StoredFsrs {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  /** 0 New, 1 Learning, 2 Review, 3 Relearning (ts-fsrs State). */
  state: number
  last_review?: number
}

/** A position where the user must find their main repertoire move. */
export interface TrainingCard {
  /** `<repertoireId>|<epd>` */
  id: string
  repertoireId: string
  epd: string
  /** The expected move; when the main move changes, the card is reset. */
  uci: string
  san: string
  /** Undefined until the card has been introduced in "Impara". */
  fsrs?: StoredFsrs
  introducedAt?: number
  updatedAt: number
}

export interface ReviewLogEntry {
  /** `<cardId>|<reviewedAt>` */
  id: string
  cardId: string
  repertoireId: string
  reviewedAt: number
  /** ts-fsrs Rating: 1 Again, 2 Hard, 3 Good, 4 Easy. */
  rating: number
  correct: boolean
  /** Thinking time, ms. */
  elapsedMs: number
  updatedAt: number
}
