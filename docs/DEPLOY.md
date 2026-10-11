# Pubblicare chess_app su Cloudflare Pages

L'app è un sito statico: Cloudflare Pages la ricostruisce da GitHub a ogni push e la serve su un indirizzo tipo `https://chess-app.pages.dev`. È gratuito e sul PC non serve installare nulla.

## Una volta sola (circa 5 minuti)
1. Crea un account gratuito su https://dash.cloudflare.com/sign-up.
2. Nel pannello: **Workers & Pages → Create → Pages → Connect to Git**.
3. Autorizza GitHub e scegli il repository **APruner-23/chess_app**.
4. Impostazioni di build:
   - **Framework preset**: None
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variables**: `NODE_VERSION` = `22`
5. **Save and Deploy**. La prima build dura qualche minuto.

Da quel momento ogni push su `main` aggiorna il sito da solo.

## Cosa fa il repository per Cloudflare
- `public/_headers`: gli header COOP/COEP (isolamento tra origini), uguali a quelli dello sviluppo.
- `public/_redirects`: ogni indirizzo dell'app (es. `/partite`, `/oauth`) torna a `index.html`, così funzionano i link diretti e il ritorno da Lichess.

## Prima prova dal vivo
1. **Partite → Importa partite**: prima vera chiamata a Chess.com e Lichess.
2. **Impostazioni → Collega Lichess**: Lichess chiede l'autorizzazione e ti riporta su `/oauth`. Poi l'explorer in **Repertori** deve mostrare le mosse.
3. Sul telefono: apri l'indirizzo e scegli **Aggiungi a schermata Home** (Chrome: menu ⋮ → Installa app; Safari: Condividi → Aggiungi alla schermata Home).
4. Offline: dopo la prima apertura l'app e il motore funzionano anche senza rete. Import, explorer e cloud eval ovviamente no.

## Dati e backup
I dati restano nel browser di ogni dispositivo. Per portarli dal PC al telefono: **Impostazioni → Esporta backup** su uno e **Importa backup** sull'altro. Per ogni elemento vince la versione più recente; il token di Lichess non è mai nel file.
