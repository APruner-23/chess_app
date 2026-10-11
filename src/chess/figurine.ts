const FIGURINES: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' }

/** "Nf3" → "♘f3", "e8=Q+" → "e8=♕+". In SAN, uppercase letters are always pieces. */
export function figurine(san: string): string {
  return san.replace(/[KQRBN]/g, (letter) => FIGURINES[letter] ?? letter)
}
