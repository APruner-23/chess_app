import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from '../db/schema'
import type { Site } from '../import/types'

export const SITE_LABELS: Record<Site, string> = { chesscom: 'Chess.com', lichess: 'Lichess' }

/** The owner's public accounts, used until they are changed in Settings. */
export const DEFAULT_USERNAMES: Record<Site, string> = {
  chesscom: 'AlePruner',
  lichess: 'MalVoluto',
}

export const SITES: Site[] = ['chesscom', 'lichess']

export function withDefaults(stored: Account[]): Account[] {
  return SITES.map(
    (id) =>
      stored.find((a) => a.id === id) ?? { id, username: DEFAULT_USERNAMES[id], updatedAt: 0 },
  )
}

export function useAccounts(): Account[] | undefined {
  return useLiveQuery(async () => withDefaults(await db.accounts.toArray()))
}
