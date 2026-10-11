// Builds src/openings/openings.json (normalized EPD → {eco, name}) from the
// lichess-org/chess-openings TSV files. Run with: npm run build-openings
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chessops/chess'
import { makeFen } from 'chessops/fen'
import { parseSan } from 'chessops/san'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'data', 'chess-openings')
const out: Record<string, { eco: string; name: string }> = {}

for (const file of readdirSync(dataDir)
  .filter((f) => f.endsWith('.tsv'))
  .sort()) {
  const lines = readFileSync(join(dataDir, file), 'utf8').trim().split('\n').slice(1)
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t')
    if (!eco || !name || !pgn) continue
    const pos = Chess.default()
    for (const token of pgn.split(/\s+/)) {
      if (/^\d+\./.test(token)) continue
      const move = parseSan(pos, token)
      if (!move) throw new Error(`${file}: illegal ${token} in ${pgn}`)
      pos.play(move)
    }
    const epd = makeFen(pos.toSetup(), { epd: true })
    // Several lines can reach the same position; keep the first (alphabetical files, ECO order).
    out[epd] ??= { eco, name }
  }
}

writeFileSync(join(root, 'src', 'openings', 'openings.json'), JSON.stringify(out))
console.log(`build-openings: ${Object.keys(out).length} positions`)
