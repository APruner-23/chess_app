import { Link } from 'react-router'
import { calendarWeeks, dayKey, goalStreak } from '../training/activity'

/** Fill by share of the daily goal: one green hue, darker = less (the surface is dark). */
function cellClass(count: number, goal: number): string {
  if (count === 0) return 'bg-stone-800'
  const r = count / goal
  return r < 0.34
    ? 'bg-emerald-900'
    : r < 0.67
      ? 'bg-emerald-700'
      : r < 1
        ? 'bg-emerald-600'
        : 'bg-emerald-400'
}

const WEEKDAYS = ['L', '', 'M', '', 'V', '', 'D']

/** Today's goal, the streak of days with the goal reached, and a calendar of training. */
export function GoalCard({
  totals,
  goal,
  now,
}: {
  totals: ReadonlyMap<string, number>
  goal: number
  now: number
}) {
  const today = totals.get(dayKey(now)) ?? 0
  const streak = goalStreak(totals, goal, now)
  const weeks = calendarWeeks(totals, now, 20)
  const done = today >= goal
  return (
    <section className="rounded-lg border border-stone-800 bg-stone-950/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-48 flex-1">
          <div className="text-sm text-stone-400">Obiettivo di oggi</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold">{today}</span>
            <span className="text-stone-400">/ {goal} esercizi</span>
            {done && <span className="text-sm text-emerald-400">raggiunto ✓</span>}
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded bg-stone-800"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(today, goal)}
            aria-label="Obiettivo di oggi"
          >
            <div
              className="h-full rounded bg-emerald-500 transition-[width]"
              style={{ width: `${Math.min(100, (today / goal) * 100)}%` }}
            />
          </div>
          <div className="mt-3 text-sm">
            {streak > 0 ? (
              <span>
                🔥 <span className="font-semibold">{streak}</span>{' '}
                {streak === 1 ? 'giorno' : 'giorni'} di fila con l'obiettivo
              </span>
            ) : (
              <span className="text-stone-400">Raggiungi l'obiettivo per iniziare una serie.</span>
            )}
          </div>
          <Link
            to="/allenamento"
            className="mt-2 inline-block text-sm text-emerald-400 hover:underline"
          >
            {done ? 'Allenati ancora →' : 'Allenati →'}
          </Link>
        </div>

        <div className="min-w-0 max-w-full overflow-x-auto">
          <div className="flex gap-[3px]" aria-label="Calendario degli ultimi 5 mesi">
            <div className="flex flex-col gap-[3px] pr-1 text-[9px] leading-[11px] text-stone-500">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="h-[11px]">
                  {d}
                </span>
              ))}
            </div>
            {weeks.map((col, w) => (
              <div key={w} className="flex flex-col gap-[3px]">
                {col.map((c) => (
                  <span
                    key={c.day}
                    title={`${new Date(`${c.day}T12:00`).toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'short',
                    })}: ${c.count} esercizi`}
                    className={`h-[11px] w-[11px] rounded-[2px] ${cellClass(c.count, goal)} ${
                      c.day === dayKey(now) ? 'ring-1 ring-stone-300' : ''
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-stone-500">
            meno
            {[0, 0.2, 0.5, 0.8, 1].map((r) => (
              <span
                key={r}
                className={`h-[10px] w-[10px] rounded-[2px] ${cellClass(r * goal, goal)}`}
              />
            ))}
            più
          </div>
        </div>
      </div>
    </section>
  )
}
