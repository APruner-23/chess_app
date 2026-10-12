import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import type { Color } from '../import/types'
import { getCloudEval, type CloudEval } from '../lichess/cloudEval'
import { totalGames, type ExplorerDb, type ExplorerResult } from '../lichess/explorer'
import { NeedsTokenError } from '../lichess/cache'
import { myGamesMoves } from '../openings/myGames'
import { figurine } from '../chess/figurine'
import { explorer, useExplorerParams } from './lichessClient'
import { EnginePanel, PvLineView } from './EnginePanel'
import { formatEval } from './evalFormat'

type Tab = 'lichess' | 'masters' | 'mine'
const TABS: [Tab, string][] = [
  ['lichess', 'Lichess al tuo livello'],
  ['masters', 'Maestri'],
  ['mine', 'Le tue partite'],
]

export interface MoveRow {
  san: string
  games: number
  /** Results from White's point of view, or from the user's for "Le tue partite". */
  white: number
  draws: number
  black: number
}

interface ExplorerPanelProps {
  epd: string
  /** Full FEN of the same position (move numbers for the engine lines). */
  fen: string
  /** Repertoire color: "Le tue partite" shows only games played with this color. */
  color: Color
  /** Moves already in the repertoire from this position. */
  prepared: Set<string>
  onPlay: (san: string) => void
  onAdd: (sans: string[]) => void
  onBest?: (uci?: string) => void
}

function useExplorer(dbName: ExplorerDb, epd: string, enabled: boolean) {
  const params = useExplorerParams()
  const [state, setState] = useState<{ key: string; data?: ExplorerResult; error?: string }>({
    key: '',
  })
  const key = `${dbName}|${epd}|${JSON.stringify(params)}`
  useEffect(() => {
    if (!enabled) return
    let live = true
    explorer
      .get(dbName, epd, params)
      .then((data) => live && setState({ key, data }))
      .catch(
        (e: Error) =>
          live &&
          setState({
            key,
            error:
              e instanceof NeedsTokenError
                ? e.message
                : `Explorer non raggiungibile (${e.message}).`,
          }),
      )
    return () => {
      live = false
    }
  }, [dbName, epd, params, key, enabled])
  return state.key === key ? state : { key, loading: true as const }
}

/** Share of games: small ones keep a decimal, so a rare move doesn't look unplayed. */
function formatShare(x: number): string {
  const pct = x * 100
  if (pct >= 10) return `${Math.round(pct)}%`
  if (pct >= 0.1) return `${pct.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
  return '<0,1%'
}

function MoveTable({
  rows,
  prepared,
  onPlay,
  onAdd,
  userView,
}: {
  rows: MoveRow[]
  prepared: Set<string>
  onPlay: (san: string) => void
  onAdd: (sans: string[]) => void
  userView?: boolean
}) {
  const total = rows.reduce((a, r) => a + r.games, 0)
  if (rows.length === 0)
    return <p className="p-2 text-stone-500">Nessuna partita da questa posizione.</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-stone-500">
        <tr>
          <th className="py-1 pl-2">Mossa</th>
          <th className="text-right">Partite</th>
          <th className="pl-3">{userView ? 'V / P / S (tu)' : 'Bianco / Patta / Nero'}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const n = r.white + r.draws + r.black || 1
          return (
            <tr key={r.san} className="border-t border-stone-800 hover:bg-stone-800/40">
              <td className="py-1 pl-2">
                <button
                  type="button"
                  onClick={() => onPlay(r.san)}
                  className="font-medium hover:underline"
                >
                  {figurine(r.san)}
                </button>
              </td>
              <td className="text-right whitespace-nowrap text-stone-300">
                {r.games.toLocaleString('it-IT')}{' '}
                <span className="text-stone-500">({formatShare(r.games / total)})</span>
              </td>
              <td className="pl-3">
                <div
                  className="flex h-5 w-36 overflow-hidden rounded border border-stone-600 text-[11px] leading-[18px] font-medium sm:w-48"
                  title={`${r.white.toLocaleString('it-IT')} / ${r.draws.toLocaleString('it-IT')} / ${r.black.toLocaleString('it-IT')} partite`}
                >
                  {(
                    [
                      [r.white, 'bg-stone-100 text-stone-900'],
                      [r.draws, 'bg-stone-500 text-white'],
                      [r.black, 'bg-stone-950 text-stone-100'],
                    ] as const
                  ).map(([v, cls], i) => {
                    const pct = (v / n) * 100
                    return (
                      <div
                        key={i}
                        className={`overflow-hidden text-center ${cls}`}
                        style={{ width: `${pct}%` }}
                      >
                        {pct >= 12 ? `${Math.round(pct)}%` : ''}
                      </div>
                    )
                  })}
                </div>
              </td>
              <td className="pr-2 text-right">
                {prepared.has(r.san) ? (
                  <span className="text-emerald-400" title="Già nel repertorio">
                    ✓
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd([r.san])}
                    className="rounded bg-stone-800 px-2 hover:bg-stone-700"
                    title="Aggiungi al repertorio"
                  >
                    +
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Explorer with four sources: Lichess at the user's level, masters, own games, engine. */
export function ExplorerPanel({
  epd,
  fen,
  color,
  prepared,
  onPlay,
  onAdd,
  onBest,
}: ExplorerPanelProps) {
  const [tab, setTab] = useState<Tab>('lichess')
  const [threshold, setThreshold] = useState(5)
  const remote = useExplorer(
    tab === 'masters' ? 'masters' : 'lichess',
    epd,
    tab === 'lichess' || tab === 'masters',
  )
  const mine = useLiveQuery(
    async () =>
      tab === 'mine'
        ? myGamesMoves(
            (await db.gamePositions.where('epd').equals(epd).toArray()).filter(
              (r) => r.userColor === color,
            ),
          )
        : undefined,
    [epd, tab, color],
  )
  const cloud = useLiveQuery(
    async () => ({ epd, value: await getCloudEval(db, epd).catch(() => null) }),
    [epd],
  )
  // The cloud eval's best move gets the arrow; without it, the local engine reports its own.
  const cloudBest = cloud?.epd === epd ? (cloud.value?.pvs[0]?.moves[0] ?? null) : undefined
  useEffect(() => {
    if (cloudBest !== null) onBest?.(cloudBest)
  }, [cloudBest, onBest])
  const opponentTurn = (epd.split(' ')[1] === 'w' ? 'white' : 'black') !== color

  const rows: MoveRow[] | undefined =
    'data' in remote && remote.data
      ? remote.data.moves.map((m) => ({
          san: m.san,
          games: totalGames(m),
          white: m.white,
          draws: m.draws,
          black: m.black,
        }))
      : undefined
  const total = rows?.reduce((a, r) => a + r.games, 0) ?? 0

  return (
    <>
      {cloud?.epd !== epd ? (
        <p className="rounded-lg bg-stone-950/40 p-2 text-sm text-stone-500">Motore: carico…</p>
      ) : cloud.value ? (
        <CloudEvalView fen={fen} value={cloud.value} onPlay={(sans) => sans.forEach(onPlay)} />
      ) : (
        <EnginePanel fen={fen} onBest={onBest} onPlay={(sans) => sans.forEach(onPlay)} />
      )}
      <section className="rounded-lg bg-stone-950/40 text-sm">
        <div className="flex overflow-x-auto border-b border-stone-800">
          {TABS.map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 ${tab === t ? 'border-emerald-500 text-white' : 'border-transparent text-stone-400'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {(tab === 'lichess' || tab === 'masters') &&
          ('loading' in remote ? (
            <p className="p-2 text-stone-500">Carico…</p>
          ) : remote.error ? (
            <p className="p-2 text-amber-300">{remote.error}</p>
          ) : (
            <>
              <MoveTable rows={rows ?? []} prepared={prepared} onPlay={onPlay} onAdd={onAdd} />
              {opponentTurn && rows && rows.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-stone-800 p-2">
                  <button
                    type="button"
                    className="rounded bg-stone-800 px-2 py-1 hover:bg-stone-700"
                    onClick={() =>
                      onAdd(
                        rows
                          .filter((r) => r.games / total >= threshold / 100 && !prepared.has(r.san))
                          .map((r) => r.san),
                      )
                    }
                  >
                    Aggiungi tutte le risposte sopra
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value) || 5)}
                    className="w-14 rounded border border-stone-700 bg-stone-950 px-1 py-0.5"
                  />
                  %
                </div>
              )}
            </>
          ))}

        {tab === 'mine' &&
          (mine === undefined ? (
            <p className="p-2 text-stone-500">Carico…</p>
          ) : (
            <MoveTable
              userView
              rows={mine.map((m) => ({
                san: m.san,
                games: m.games,
                white: m.wins,
                draws: m.draws,
                black: m.losses,
              }))}
              prepared={prepared}
              onPlay={onPlay}
              onAdd={onAdd}
            />
          ))}
      </section>
    </>
  )
}

function CloudEvalView({
  fen,
  value,
  onPlay,
}: {
  fen: string
  value: CloudEval
  onPlay: (sans: string[]) => void
}) {
  return (
    <section className="rounded-lg bg-stone-950/40 p-2 text-sm">
      <div className="mb-1 text-stone-400">Cloud eval di Lichess · profondità {value.depth}</div>
      <ul className="space-y-1">
        {value.pvs.map((pv, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-14 shrink-0 font-mono font-semibold">{formatEval(pv.eval)}</span>
            <PvLineView fen={fen} pv={pv.moves} onPlay={onPlay} />
          </li>
        ))}
      </ul>
    </section>
  )
}
