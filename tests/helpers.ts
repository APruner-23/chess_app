import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fixtures = join(import.meta.dirname, 'fixtures')

export function fixtureText(path: string): string {
  return readFileSync(join(fixtures, path), 'utf8')
}

export function fixtureJson<T>(path: string): T {
  return JSON.parse(fixtureText(path)) as T
}

export function ndjsonLines<T>(path: string): T[] {
  return fixtureText(path)
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as T)
}
