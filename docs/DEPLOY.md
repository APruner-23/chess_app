# Pubblicare chess_app su Cloudflare Pages

L'app è un sito statico: Cloudflare Pages la ricostruisce da GitHub a ogni push e la serve su un indirizzo tipo `https://chess-app.pages.dev`. È gratuito e sul PC non serve installare nulla.

## Una volta sola (circa 5 minuti)
1. Crea un account gratuito su https://dash.cloudflare.com/sign-up.
2. Nel pannello: **Compute → Workers & Pages → Create** e collega GitHub (va bene sia un Worker sia un progetto Pages).
3. Autorizza GitHub e scegli il repository **APruner-23/chess_app**.
4. Impostazioni di build:
   - **Framework preset**: None
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variables**: `NODE_VERSION` = `22`
5. **Save and Deploy**. La prima build dura qualche minuto.

Da quel momento ogni push su `main` aggiorna il sito da solo.

## Cosa fa il repository per Cloudflare
- `wrangler.jsonc`: per i Worker (la modalità che Cloudflare propone di default), il comando di deploy `npx wrangler deploy` pubblica `dist/` e rimanda ogni indirizzo sconosciuto (es. `/partite`, `/oauth`) a `index.html`, così funzionano i link diretti e il ritorno da Lichess.
- `public/_headers`: gli header COOP/COEP (isolamento tra origini), uguali a quelli dello sviluppo.
- Non usare un file `_redirects` con `/* /index.html 200`: i Worker lo rifiutano come ciclo infinito (errore 100324).

## Prima prova dal vivo
1. **Partite → Importa partite**: prima vera chiamata a Chess.com e Lichess.
2. **Impostazioni → Collega Lichess**: Lichess chiede l'autorizzazione e ti riporta su `/oauth`. Poi l'explorer in **Repertori** deve mostrare le mosse.
3. Sul telefono: apri l'indirizzo e scegli **Aggiungi a schermata Home** (Chrome: menu ⋮ → Installa app; Safari: Condividi → Aggiungi alla schermata Home).
4. Offline: dopo la prima apertura l'app e il motore funzionano anche senza rete. Import, explorer e cloud eval ovviamente no.

## Dati e backup
I dati restano nel browser di ogni dispositivo. Per portarli dal PC al telefono: **Impostazioni → Esporta backup** su uno e **Importa backup** sull'altro. Per ogni elemento vince la versione più recente; il token di Lichess non è mai nel file.

## Sincronizzazione PC ↔ telefono (Cloudflare D1, gratuita)
Il Worker contiene anche un piccolo servizio di sincronizzazione con un database D1 (`chess-app-sync`), che viene creato da solo al primo deploy.

Una volta sola:
1. Nel pannello Cloudflare apri il Worker **chess-app** → **Settings** → **Variables and Secrets** → **Add**.
2. Tipo **Secret**, nome `SYNC_KEY`, valore: una frase lunga che inventi tu (è la password della sincronizzazione). Salva.
3. Su ogni dispositivo: **Impostazioni → Sincronizzazione**, incolla la stessa frase e premi **Attiva**.

Poi la sincronizzazione parte da sola: all'apertura, quando torni sull'app, ogni 3 minuti e dopo ogni import. Il token di Lichess e la chiave restano sul dispositivo.
