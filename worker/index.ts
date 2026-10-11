// Cloudflare Worker: serves the app's static assets and a small sync API backed by D1.
// Only /api/* reaches this code (wrangler.jsonc run_worker_first); the rest is assets.

interface D1Statement {
  bind(...values: unknown[]): D1Statement
  all<T>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}
export interface D1Database {
  prepare(sql: string): D1Statement
}
export interface Env {
  DB: D1Database
  ASSETS?: { fetch(request: Request): Promise<Response> }
  /** Shared secret set in the Cloudflare dashboard (Worker → Settings → Variables and Secrets). */
  SYNC_KEY?: string
}

/** One record as stored on the server. `data` is the JSON text sent by the client. */
interface Row {
  tbl: string
  id: string
  data: string | null
  updated_at: number
  deleted: number
  seq: number
}

/** Rows returned per pull page; kept small for the free plan's CPU limit. */
export const PULL_LIMIT = 300
/** Largest accepted push body. */
export const MAX_PUSH_BYTES = 1_500_000

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS records (
    tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT, updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0, seq INTEGER NOT NULL, PRIMARY KEY (tbl, id))`,
  'CREATE INDEX IF NOT EXISTS records_seq ON records (seq)',
]

// The body is passed to SQLite as is (json_each), so the Worker never parses it.
// One statement: the new sequence number is computed inside the write, so it is
// atomic, and a record changes only if the incoming copy is newer.
const UPSERT = `INSERT INTO records (tbl, id, data, updated_at, deleted, seq)
  SELECT json_extract(value, '$.tbl'), json_extract(value, '$.id'), json_extract(value, '$.data'),
    json_extract(value, '$.updatedAt'), coalesce(json_extract(value, '$.deleted'), 0),
    (SELECT coalesce(max(seq), 0) + 1 FROM records)
  FROM json_each(?1) WHERE true
  ON CONFLICT (tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
    deleted = excluded.deleted, seq = excluded.seq
  WHERE excluded.updated_at > records.updated_at`

const PULL = `SELECT tbl, id, data, updated_at, deleted, seq FROM records
  WHERE seq > ?1 ORDER BY seq, tbl, id LIMIT ?2`

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * POST /api/sync?since=<seq> with a JSON array of changes as the body
 * ([{tbl, id, data, updatedAt, deleted}]). Applies them, then returns the next page of
 * records changed after `since`: {changes, cursor, more}.
 */
async function sync(request: Request, env: Env): Promise<Response> {
  const since = Number(new URL(request.url).searchParams.get('since') ?? 0)
  if (!Number.isFinite(since) || since < 0) return json({ error: 'since non valido' }, 400)
  const body = await request.text()
  if (body.length > MAX_PUSH_BYTES) return json({ error: 'Troppi dati in una richiesta' }, 413)
  for (const sql of SCHEMA) await env.DB.prepare(sql).run()
  if (body.trim() && body.trim() !== '[]') {
    try {
      await env.DB.prepare(UPSERT).bind(body).run()
    } catch {
      return json({ error: 'Modifiche non valide' }, 400)
    }
  }
  const { results } = await env.DB.prepare(PULL)
    .bind(since, PULL_LIMIT + 1)
    .all<Row>()
  let rows = results
  let more = false
  if (rows.length > PULL_LIMIT) {
    more = true
    // Never split a group of rows sharing a sequence number across pages.
    const lastSeq = rows[PULL_LIMIT - 1]!.seq
    rows = rows.slice(0, PULL_LIMIT).filter((r) => r.seq < lastSeq)
    if (rows.length === 0) rows = results.filter((r) => r.seq === lastSeq)
  }
  const cursor = rows.length ? rows[rows.length - 1]!.seq : since
  // Built as text: `data` is already JSON, re-parsing it would only cost CPU.
  const changes = rows
    .map(
      (r) =>
        `{"tbl":${JSON.stringify(r.tbl)},"id":${JSON.stringify(r.id)},"updatedAt":${r.updated_at},` +
        `"deleted":${r.deleted ? 'true' : 'false'},"data":${r.data ?? 'null'}}`,
    )
    .join(',')
  return new Response(`{"changes":[${changes}],"cursor":${cursor},"more":${more}}`, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) {
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 })
  }
  if (!env.SYNC_KEY)
    return json({ error: 'Sincronizzazione non configurata sul server (SYNC_KEY).' }, 503)
  const auth = request.headers.get('Authorization') ?? ''
  if (!sameSecret(auth, `Bearer ${env.SYNC_KEY}`))
    return json({ error: 'Chiave di sincronizzazione errata.' }, 401)
  if (url.pathname === '/api/ping') return json({ ok: true })
  if (url.pathname === '/api/sync' && request.method === 'POST') return sync(request, env)
  return json({ error: 'Not found' }, 404)
}

export default { fetch: handle }
