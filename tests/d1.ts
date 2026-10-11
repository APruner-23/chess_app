import { DatabaseSync } from 'node:sqlite'
import type { D1Database } from '../worker/index'

/** In-memory D1 stand-in on Node's SQLite, enough for the sync Worker. */
export function fakeD1(): D1Database {
  const db = new DatabaseSync(':memory:')
  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    all: async <T>() => ({ results: db.prepare(sql).all(...(params as never[])) as T[] }),
    run: async () => db.prepare(sql).run(...(params as never[])),
  })
  return { prepare: (sql: string) => statement(sql) }
}
