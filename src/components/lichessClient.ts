import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { getSetting } from '../db/settings'
import { DEFAULT_EXPLORER, ExplorerClient, type ExplorerParams } from '../lichess/explorer'
import { TOKEN_KEY } from '../lichess/oauth'

export const EXPLORER_KEY = 'explorerParams'

/** The token never leaves this device: it lives only in the local settings table. */
export const getLichessToken = () => getSetting<string | undefined>(db, TOKEN_KEY, undefined)

export const explorer = new ExplorerClient({ db, getToken: getLichessToken })

export function useExplorerParams(): ExplorerParams {
  return useLiveQuery(() => getSetting(db, EXPLORER_KEY, DEFAULT_EXPLORER)) ?? DEFAULT_EXPLORER
}

export function useLichessConnected(): boolean | undefined {
  return useLiveQuery(async () => Boolean(await getLichessToken()))
}

export const oauthRedirectUri = () => `${location.origin}${import.meta.env.BASE_URL}oauth`
