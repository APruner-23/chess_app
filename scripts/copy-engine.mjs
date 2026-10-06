// Copies the Stockfish 19 *lite* builds from node_modules into public/engine/.
// The full builds (~94 MB) are never copied or committed.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'stockfish', 'bin')
const dest = join(root, 'public', 'engine')
const files = [
  'stockfish-19-lite.js',
  'stockfish-19-lite.wasm',
  'stockfish-19-lite-single.js',
  'stockfish-19-lite-single.wasm',
]

mkdirSync(dest, { recursive: true })
for (const file of files) {
  const from = join(src, file)
  const to = join(dest, file)
  if (!existsSync(from)) throw new Error(`Missing engine file: ${from}`)
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue
  copyFileSync(from, to)
  console.log(`copy-engine: ${file}`)
}
