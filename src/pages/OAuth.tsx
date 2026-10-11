import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { db } from '../db/schema'
import { setSetting } from '../db/settings'
import { TOKEN_KEY, exchangeCode } from '../lichess/oauth'
import { oauthRedirectUri } from '../components/lichessClient'

/** Lichess redirects here after the user authorizes the app. */
export function OAuth() {
  const navigate = useNavigate()
  const [error, setError] = useState<string>()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // StrictMode runs effects twice; the code works only once
    started.current = true
    const params = new URLSearchParams(location.search)
    const saved = JSON.parse(sessionStorage.getItem('oauth') ?? 'null') as {
      verifier: string
      state: string
    } | null
    sessionStorage.removeItem('oauth')
    const code = params.get('code')
    if (!code || !saved || params.get('state') !== saved.state) {
      queueMicrotask(() => setError(params.get('error_description') ?? 'Collegamento non valido.'))
      return
    }
    exchangeCode({ code, verifier: saved.verifier, redirectUri: oauthRedirectUri() })
      .then((token) => setSetting(db, TOKEN_KEY, token))
      .then(() => navigate('/impostazioni', { replace: true }))
      .catch((e: Error) => setError(e.message))
  }, [navigate])

  return <p className="text-stone-300">{error ?? 'Collegamento a Lichess in corso…'}</p>
}
