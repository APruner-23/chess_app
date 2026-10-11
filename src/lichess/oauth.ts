/** Lichess OAuth2 with PKCE: public client, no registration, no scopes needed for the explorer. */

export const LICHESS_CLIENT_ID = 'chess-app-personal'
export const TOKEN_KEY = 'lichessToken'

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomString(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

export function authorizeUrl(opts: {
  redirectUri: string
  challenge: string
  state: string
}): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: LICHESS_CLIENT_ID,
    redirect_uri: opts.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: opts.challenge,
    state: opts.state,
  })
  return `https://lichess.org/oauth?${q}`
}

/** Exchanges the authorization code for an access token. */
export async function exchangeCode(opts: {
  code: string
  verifier: string
  redirectUri: string
  fetch?: typeof fetch
}): Promise<string> {
  const res = await (opts.fetch ?? fetch)('https://lichess.org/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      code_verifier: opts.verifier,
      redirect_uri: opts.redirectUri,
      client_id: LICHESS_CLIENT_ID,
    }),
  })
  if (!res.ok) throw new Error(`Lichess ha rifiutato il collegamento (errore ${res.status})`)
  const { access_token } = (await res.json()) as { access_token: string }
  return access_token
}
