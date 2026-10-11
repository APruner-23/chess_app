# Piano di chess_app: analisi partite e allenamento aperture

## Stato
- [x] **Fase 0**: repo, piano, CLAUDE.md, fixture reali e dataset aperture (2026-10-07)
- [x] **M0**: scaffold (2026-10-06)
- [x] **M1**: import partite e prime statistiche (2026-10-11)
- [x] **M2**: motore e revisione partita (2026-10-11)
- [ ] **M3**: repertorio ed explorer
- [ ] **M4**: allenamento FSRS
- [ ] **M5**: feedback dalle partite e dashboard
- [ ] **M6**: mobile, PWA, backup, pubblicazione

## Contesto
È una web app personale per due cose: **analizzare le partite** giocate su Lichess e Chess.com, e **imparare e sperimentare aperture** con un metodo che abbia senso. Le decisioni prese:
- **Uso**: un solo utente, su PC e telefono. È una PWA "local-first" (i dati stanno nel browser), installabile sul telefono.
- **Stack**: TypeScript + React, tutto nel browser, con Stockfish in WASM. Non serve un server.
- **Allenamento nella v1**: repertorio con ripetizione spaziata, più feedback automatico dalle partite. Sparring, puzzle e coach AI arrivano nella v2.
- **Sync PC↔telefono**: più avanti. Per ora si fa backup e ripristino con un file JSON, e lo schema nasce già pronto per la sync.
- **Sviluppo nel cloud.** Il codice si scrive in sessioni Claude Code cloud (i crediti scadono a novembre 2026) sul repo privato https://github.com/APruner-23/chess_app. Sul PC Node non c'è e non serve.

**Profilo del giocatore** (dati pubblici del 2026-10-07):

| Account | Partite | Rating |
|---|---|---|
| Chess.com **AlePruner** (account principale, dal 2021) | circa 2.700 | rapid 1112 (679 partite), blitz 772 (1336), bullet 592 (650), daily 1147 (14) |
| Lichess **MalVoluto** | 154 | rapid circa 1340, blitz circa 1120, bullet circa 1210 (ancora provvisori) |

Cosa ne segue per l'app:
- l'import da Chess.com ha la priorità;
- l'explorer di default è tarato sul livello del giocatore (fascia Lichess 1200–1600, modificabile);
- il repertorio resta poco profondo (8–10 mosse) e si punta molto sugli errori subito dopo la fine della preparazione;
- il motore analizza le partite su richiesta e le ultime 100 in background, non tutte le 2.700.

**API verificate dal vivo** (i dettagli tecnici sono in CLAUDE.md):
- **Export partite Lichess** (NDJSON): funziona senza login e include le valutazioni se la partita è già stata analizzata su Lichess.
- **Chess.com PubAPI**: CORS `*`, richieste una alla volta, dati con qualche ora di ritardo.
- **Opening Explorer Lichess**: **richiede un token**. Si ottiene con "Collega Lichess" (OAuth PKCE); in alternativa si incolla un token personale.
- **Cloud eval Lichess**: funziona senza token.

## Il metodo di apprendimento (il ciclo su cui è costruita l'app)
1. **Scegli con i dati.** L'explorer mostra cosa funziona *al tuo livello e alle tue cadenze*, accanto a Maestri, motore e i tuoi risultati con quella linea.
2. **Prepara ciò che incontrerai davvero.** Il repertorio resta snello: si risponde prima alle mosse avversarie più frequenti. La "copertura" dice in quale % di partite resti in preparazione e quali sono i buchi più probabili. Ogni mossa chiave ha una nota sull'idea.
3. **Impara a piccole dosi.** Al massimo N posizioni nuove al giorno: prima l'app te le mostra (freccia + nota), poi le giochi tu.
4. **Ripassa con FSRS.** L'app gioca le mosse avversarie e tu rispondi; ripassi solo ciò che stai per dimenticare.
5. **Gioca** su Chess.com o Lichess.
6. **Importa e confronta.** Ogni partita viene confrontata col repertorio:
   - le mosse dimenticate tornano subito in ripasso;
   - le mosse avversarie impreviste diventano buchi da preparare, in ordine di frequenza;
   - gli errori appena fuori dalla preparazione diventano proposte per allungare la linea.

   Le statistiche per linea (punteggio, valutazione all'uscita dal libro) dicono se un'apertura "sperimentale" merita di restare.

## Architettura e stack
Tutto gira nel browser:
- interfaccia React;
- Stockfish in un Web Worker;
- IndexedDB per i dati;
- chiamate `fetch` a lichess.org, explorer.lichess.org e api.chess.com.

L'hosting è statico (Cloudflare Pages, con header COOP/COEP in `public/_headers`).

| Area | Scelta |
|---|---|
| Base | Vite 8, React 19, TypeScript, Tailwind CSS 4, React Router, Zustand |
| Scacchiera | `@lichess-org/chessground` 10 (quella di Lichess: drag/click, frecce, touch) |
| Regole, FEN/EPD, PGN con varianti | `chessops` 0.15 |
| Motore | `stockfish` 19, build **lite** da circa 1,6 MB copiata in `public/engine/`. Multi-thread se `crossOriginIsolated`, altrimenti single-thread |
| Database | Dexie 4 (IndexedDB) + `dexie-react-hooks` |
| Ripetizione spaziata | `ts-fsrs` 5 (FSRS-6), retention obiettivo 90% |
| Grafici / PWA / test | Recharts / `vite-plugin-pwa` / Vitest + `fake-indexeddb` |

- **Interfaccia** in italiano, con le mosse in notazione figurina (♘f3).
- **Licenza** del progetto: GPL-3.0.

## Modello dati (Dexie)
Gli id sono stringhe deterministiche (per esempio `chesscom:<uuid>`, `repId|epd`) e ogni record ha `updatedAt`. Così il backup JSON si può unire a dati esistenti, e nella v2 si aggiunge Dexie Cloud senza migrazioni.

| Tabella | Contenuto | Backup/sync |
|---|---|---|
| `accounts` | username, ultimo import | sì |
| `games` | partita normalizzata: colore, risultato dal punto di vista dell'utente, cadenza, mosse SAN, orologi, apertura (ECO e nome) | sì |
| `analyses` | per ogni semimossa: valutazione, mossa migliore, giudizio; accuratezza | sì |
| `gamePositions` | indice EPD → partite (prime 30 mosse), usato per "Le tue partite" e per le statistiche | no (si ricalcola) |
| `repertoires`, `repMoves` | repertori (nome, colore, tag "sperimentale") e archi del grafo (EPD di partenza, mossa, EPD di arrivo, nota) | sì |
| `cards`, `reviewLogs` | stato FSRS e storico dei ripassi | sì |
| `feedback` | deviazioni, buchi e uscite dal libro, con il loro stato | sì |
| `explorerCache`, `evalCache`, `settings` | cache e preferenze. Il **token Lichess resta solo locale e non viene mai esportato** | no / parziale |

L'EPD è normalizzata (en passant contato solo se legale), così le trasposizioni condividono la stessa posizione e la stessa carta.

## Struttura del progetto
```
chess_app/
├─ CLAUDE.md, README.md, docs/PLAN.md
├─ data/chess-openings/   TSV CC0 → scripts/build-openings.ts → src/openings/openings.json
├─ public/      _headers (COOP/COEP), icone PWA, engine/ (copiato da node_modules con scripts/copy-engine.mjs)
├─ src/
│  ├─ db/          schema Dexie, backup.ts
│  ├─ chess/       helper chessops: EPD normalizzata, SAN/UCI, PGN
│  ├─ import/      lichess.ts (stream NDJSON), chesscom.ts (archivi in serie), normalize.ts, sync.ts
│  ├─ openings/    classify.ts (apertura più profonda trovata lungo la partita)
│  ├─ engine/      engine.ts (Worker + UCI), queue.ts (priorità: posizione a schermo prima del batch)
│  ├─ analysis/    winPercent.ts, accuracy.ts, judgments.ts, analyzeGame.ts
│  ├─ lichess/     oauth.ts (PKCE), explorer.ts, cloudEval.ts (cache, una richiesta alla volta, 60 s di pausa su 429)
│  ├─ repertoire/  graph.ts, coverage.ts, pgnIO.ts (import PGN o studio Lichess, export PGN)
│  ├─ training/    cards.ts, session.ts, fsrs.ts
│  ├─ feedback/    compareGame.ts
│  ├─ components/  Board (wrapper di chessground), EvalBar, EvalGraph, MoveList, ExplorerPanel, EnginePanel
│  └─ pages/       Dashboard, Partite, Revisione, Repertori, Editor, Allenamento, Feedback, Impostazioni
└─ tests/       Vitest + fixtures/ (partite reali dell'utente)
```

## Milestone
Per ogni milestone il ciclo è sempre lo stesso: codice, test verdi, commit, push, spunta in "Stato" e un breve riepilogo in italiano per l'utente.

**M0 – Scaffold**
- Vite react-ts, dipendenze, Tailwind, Router, Vitest, ESLint/Prettier, LICENSE (GPL-3.0).
- Header COOP/COEP in `vite.config.ts` e script che copia il motore.
- Shell dell'app con la navigazione: Dashboard, Partite, Repertori, Allenamento, Feedback, Impostazioni.

**M1 – Import e prime statistiche**
- Username in Impostazioni (precompilati: AlePruner, MalVoluto) e periodo da importare.
- Chess.com: tutti gli archivi mensili, in serie. Lichess: in streaming, riusando le valutazioni già presenti.
- Vengono importate solo le partite standard.
- Classificazione delle aperture e indice `gamePositions`.
- Pagina Partite con filtri, visualizzatore semplice e **statistiche per apertura senza motore** (V/P/S per apertura, colore e cadenza).
- *A fine M1 l'utente decide come vedere le anteprime (Cloudflare Pages o in locale).* → Rimandato: per ora solo test e prove headless (2026-10-11).

**M2 – Motore e revisione partita**
- Worker Stockfish con parser UCI e coda a priorità.
- Analisi della partita: si riusano le valutazioni Lichess se ci sono, altrimenti Stockfish locale a nodi fissi (preset "veloce" su mobile, "accurata" su PC). Il risultato si salva una volta sola.
- Le formule di Lichess (Win%, accuratezza, giudizi) sono in CLAUDE.md.
- Pagina di revisione:
  - barra e grafico della valutazione (click → salta a quella mossa);
  - mosse con ?!, ?, ??;
  - analisi live MultiPV 3, freccia con la mossa migliore, "prossimo errore".
- In background: analisi delle ultime 100 partite, con avanzamento e pausa.

**M3 – Repertorio ed explorer (il laboratorio)**
- "Collega Lichess" (OAuth PKCE) e repertori multipli, compresi quelli "sperimentali".
- Editor con scacchiera, albero delle mosse e note.
- Pannello explorer con quattro schede:
  - **Lichess al tuo livello**;
  - **Maestri**;
  - **Le tue partite**;
  - **Motore** (prima il cloud eval, poi Stockfish).
- Per ogni mossa: frequenza, V/P/S, valutazione. Con un clic si aggiunge una mossa, oppure "aggiungi tutte le risposte avversarie sopra X%".
- **Copertura**: % di partite che restano in preparazione fino alla mossa N, più i buchi più probabili (probabilità di arrivarci × frequenza della mossa).
- Import da PGN o da URL di studio Lichess; export in PGN.

**M4 – Allenamento (FSRS)**
- Una carta è una posizione in cui tocca all'utente, con la sua mossa principale. Se la mossa cambia, la carta si azzera.
- **Impara**: 10 posizioni nuove al giorno di default, ordinate per probabilità di incontrarle. Prima l'app le mostra, poi l'utente le gioca.
- **Ripassa**: le carte dovute vengono raggruppate in linee. L'app gioca le mosse avversarie e le mosse non dovute dell'utente; l'utente gioca quelle dovute.
  - Voto automatico: giusta → Good (Hard se molto lenta); sbagliata → Again e la correzione va rigiocata.
- **Difficili**: le carte sbagliate più spesso.
- Statistiche: carte dovute oggi e nei prossimi 7 giorni, % ricordate, serie di giorni consecutivi.

**M5 – Feedback dalle partite e dashboard**
- `compareGame.ts` scorre ogni partita nuova sui repertori del colore dell'utente e trova quattro casi:
  - **Deviazione**: l'utente ha giocato una mossa diversa dal repertorio. Decide lui:
    - "dimenticata" → ripasso subito come Again;
    - "scelta voluta" → la aggiunge come alternativa o la sostituisce;
    - oppure la ignora.
  - **Buco**: mossa avversaria non prevista. Mostra la frequenza al suo livello, la valutazione e com'è andata la partita; "Prepara risposta" apre l'editor.
  - **Uscita dal libro**: si salvano il punto e la valutazione, per le statistiche per linea.
  - **Errore entro circa 8 mosse dall'uscita dal libro**: propone di allungare la linea con la mossa del motore, che diventa una carta.
- Inbox Feedback raggruppata per posizione e ordinata per frequenza.
- Dashboard:
  - statistiche per apertura e per linea: punteggio, accuratezza, valutazione media all'uscita dal libro, andamento nel tempo;
  - confronto sperimentali vs principali;
  - andamento del rating;
  - suggerimenti "da studiare", contatore delle carte dovute e dei feedback aperti.

**M6 – Mobile, PWA, backup, pubblicazione**
- Layout responsive con barra di navigazione in basso; l'allenamento è ottimizzato per il telefono.
- PWA offline.
- Export/import JSON.
- Deploy su Cloudflare Pages con `_headers`, solo con l'OK e l'account dell'utente.

**v2 (fuori dalla v1)**: sync con Dexie Cloud; sparring contro un "bot umano" che pesca le mosse dall'explorer; puzzle dagli errori nel mediogioco e nel finale; coach AI con Claude.

## Verifica
- **Test unitari** (`npm test`) offline, sulle fixture reali:
  - normalizzazione;
  - classificazione aperture (per esempio 1.e4 c5 2.♘f3 d6 → B50);
  - Win%, accuratezza e giudizi;
  - grafo con trasposizioni;
  - confronto partita↔repertorio;
  - sessioni FSRS con orologio finto.
- **Controprova con Lichess**: sulle partite di `malvoluto-analysed.ndjson`, ricalcolare accuratezza e numero di errori dalle valutazioni di Lichess. Devono coincidere (±1) con quelli che riporta Lichess.
- **Controprova del motore**: posizioni note (matto in 1) e posizioni d'apertura confrontate con il cloud eval.
- **Nel cloud**: `npm run build` e test a ogni milestone, più uno smoke test con Playwright headless se l'ambiente lo permette.
- **Prove con le API vere e controllo visivo**: si fanno sulle anteprime scelte a fine M1, su PC e su telefono, a meno che l'utente non autorizzi i domini lichess.org, explorer.lichess.org e api.chess.com nelle impostazioni di rete dell'ambiente cloud.

## Cosa serve dall'utente
1. A fine M1: scegliere come vedere le anteprime.
2. In M3: cliccare "Collega Lichess" e autorizzare su lichess.org.
3. In M6, solo se vuole pubblicare: un account Cloudflare gratuito.
