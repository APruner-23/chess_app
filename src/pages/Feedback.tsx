import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { makeUci } from 'chessops'
import { parseSan } from 'chessops/san'
import { PageHeader } from '../components/PageHeader'
import { Board } from '../components/Board'
import { formatDate } from '../components/format'
import { explorer, useExplorerParams } from '../components/lichessClient'
import { figurine } from '../chess/figurine'
import { db } from '../db/schema'
import { groupKey } from '../feedback/compareGame'
import {
  acceptDeviation,
  extendLine,
  ignore,
  markForgotten,
  processFeedback,
} from '../feedback/repo'
import type { FeedbackItem, FeedbackKind } from '../feedback/types'
import { totalGames } from '../lichess/explorer'
import { positionFromEpd } from '../repertoire/graph'
import type { Repertoire } from '../repertoire/types'

const KIND_LABELS: Record<Exclude<FeedbackKind, 'exit'>, string> = {
  deviation: 'Deviazione dal repertorio',
  hole: 'Buco: mossa avversaria non preparata',
  extend: 'Errore appena fuori dal libro',
}

function line(path: string[], extra?: string): string {
  const all = extra ? [...path, extra] : path
  return all
    .map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}.` : i === 0 ? '1…' : ''}${figurine(san)}`)
    .join(' ')
}

function uciOf(epd: string, san?: string): string | undefined {
  if (!san) return undefined
  const move = parseSan(positionFromEpd(epd), san)
  return move ? makeUci(move) : undefined
}

/** Inbox of what the games say about the repertoires, grouped by position. */
export function Feedback() {
  const [busy, setBusy] = useState(true)
  const [archived, setArchived] = useState(false)
  useEffect(() => {
    processFeedback(db).finally(() => setBusy(false))
  }, [])
  const data = useLiveQuery(
    async () => ({
      items: await db.feedback
        .where('status')
        .anyOf(archived ? ['done', 'ignored'] : ['open'])
        .toArray(),
      reps: new Map((await db.repertoires.toArray()).map((r) => [r.id, r])),
    }),
    [archived],
  )

  const groups = useMemo(() => {
    const map = new Map<string, FeedbackItem[]>()
    for (const f of data?.items ?? []) map.set(groupKey(f), [...(map.get(groupKey(f)) ?? []), f])
    return [...map.values()].sort((a, b) => b.length - a.length || b[0]!.playedAt - a[0]!.playedAt)
  }, [data])

  return (
    <>
      <PageHeader title="Feedback">
        Le tue partite confrontate coi repertori: mosse dimenticate, buchi da preparare, linee da
        allungare.
      </PageHeader>
      <div className="mb-4 flex items-center gap-2 text-sm">
        {[false, true].map((a) => (
          <button
            key={String(a)}
            type="button"
            onClick={() => setArchived(a)}
            className={`rounded-md px-3 py-1 ${archived === a ? 'bg-stone-700' : 'bg-stone-800 text-stone-400'}`}
          >
            {a ? 'Archiviati' : 'Da vedere'}
          </button>
        ))}
        {busy && <span className="text-stone-500">Confronto le partite coi repertori…</span>}
      </div>
      {data && groups.length === 0 && !busy && (
        <p className="text-stone-400">
          {archived
            ? 'Niente in archivio.'
            : data.reps.size === 0
              ? 'Crea un repertorio: le partite giocate da quel momento verranno confrontate con lui.'
              : 'Nessun feedback aperto. Gioca, importa le partite e torna qui.'}
        </p>
      )}
      <ul className="space-y-3">
        {groups.map((items) => (
          <FeedbackCard
            key={groupKey(items[0]!)}
            items={items}
            rep={data!.reps.get(items[0]!.repertoireId)}
          />
        ))}
      </ul>
    </>
  )
}

function FeedbackCard({ items, rep }: { items: FeedbackItem[]; rep?: Repertoire }) {
  const navigate = useNavigate()
  const params = useExplorerParams()
  const f = items[0]!
  const kind = f.kind as Exclude<FeedbackKind, 'exit'>
  const wins = items.filter((i) => i.result === 'win').length
  const losses = items.filter((i) => i.result === 'loss').length
  const share = useLiveQuery(async () => {
    if (kind !== 'hole') return undefined
    const r = await explorer.peek('lichess', f.epd, params)
    const move = r?.moves.find((m) => m.san === f.san)
    return r && move ? totalGames(move) / Math.max(1, totalGames(r)) : undefined
  }, [f.epd, f.san, kind, params])
  const arrows = [uciOf(f.epd, f.san), uciOf(f.epd, f.expectedSan ?? f.bestSan)].filter(
    Boolean,
  ) as string[]
  const btn = 'rounded-md px-3 py-1.5 text-sm font-medium'
  const open = f.status === 'open'

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-stone-800 bg-stone-950/40 p-3 sm:flex-row">
      <div className="w-full shrink-0 sm:w-44">
        <Board fen={`${f.epd} 0 1`} orientation={rep?.color ?? 'white'} arrows={arrows} />
      </div>
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{KIND_LABELS[kind]}</span>
          <span className="text-stone-400">· {rep?.name ?? 'repertorio eliminato'}</span>
          <span className="text-stone-500">
            · {items.length} {items.length === 1 ? 'partita' : 'partite'} ({wins} V, {losses} S),
            l'ultima il {formatDate(Math.max(...items.map((i) => i.playedAt)))}
          </span>
        </div>
        <p className="text-stone-300">{line(f.path)}</p>
        {kind === 'deviation' && (
          <p>
            Hai giocato <b>{figurine(f.san!)}</b>, il repertorio prevede{' '}
            <b className="text-emerald-300">{figurine(f.expectedSan!)}</b>.
          </p>
        )}
        {kind === 'hole' && (
          <p>
            L'avversario ha giocato <b>{figurine(f.san!)}</b> e il repertorio non ha una risposta.
            {share !== undefined &&
              ` Al tuo livello si gioca nel ${Math.round(share * 100)}% delle partite.`}
          </p>
        )}
        {kind === 'extend' && (
          <p>
            Qui hai giocato <b>{figurine(f.san!)}</b>, un errore; il motore suggerisce{' '}
            <b className="text-emerald-300">{figurine(f.bestSan!)}</b>. Allungando la linea diventa
            una posizione da allenare.
          </p>
        )}
        {open && (
          <div className="flex flex-wrap gap-2 pt-1">
            {kind === 'deviation' && (
              <>
                <button
                  type="button"
                  className={`${btn} bg-sky-700 hover:bg-sky-600`}
                  onClick={() => markForgotten(db, items)}
                >
                  Dimenticata: ripassala
                </button>
                <button
                  type="button"
                  className={`${btn} bg-stone-700`}
                  onClick={() => acceptDeviation(db, items, false)}
                >
                  Voluta: aggiungi come alternativa
                </button>
                <button
                  type="button"
                  className={`${btn} bg-stone-700`}
                  onClick={() => acceptDeviation(db, items, true)}
                >
                  Voluta: sostituisci
                </button>
              </>
            )}
            {kind === 'hole' && (
              <button
                type="button"
                className={`${btn} bg-emerald-700 hover:bg-emerald-600`}
                onClick={() =>
                  navigate(`/repertori/${f.repertoireId}?linea=${[...f.path, f.san].join(',')}`)
                }
              >
                Prepara risposta
              </button>
            )}
            {kind === 'extend' && (
              <button
                type="button"
                className={`${btn} bg-emerald-700 hover:bg-emerald-600`}
                onClick={() => extendLine(db, items)}
              >
                Allunga la linea con {figurine(f.bestSan!)}
              </button>
            )}
            <button
              type="button"
              className={`${btn} bg-stone-800 text-stone-300`}
              onClick={() => ignore(db, items)}
            >
              Ignora
            </button>
            <button
              type="button"
              className={`${btn} text-stone-400 hover:underline`}
              onClick={() => navigate(`/partite/${encodeURIComponent(f.gameId)}`)}
            >
              Vedi la partita
            </button>
          </div>
        )}
      </div>
    </li>
  )
}
