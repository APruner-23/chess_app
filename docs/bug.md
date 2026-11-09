# Bug e problemi da correggere

Revisione del 2026-11-09. I problemi sono stati trovati **leggendo il codice**, non riprodotti
su un dispositivo: prima di correggerne uno conviene riprodurlo con un test.

Non sono state rilette riga per riga le pagine grandi (`Partita.tsx`, `Editor.tsx`,
`Dashboard.tsx`, `Allenamento.tsx`).

Nessuno dei problemi trovati perde o rovina i dati dell'utente.

| # | Problema | Gravità | Sforzo |
|---|---|---|---|
| 1 | Il motore che non parte blocca l'app senza messaggi | Alta | Medio |
| 2 | La sincronizzazione rilegge tutto l'archivio ogni 3 minuti | Media | Piccolo |
| 3 | Un errore in una pagina dà schermo bianco | Media | Piccolo |
| 4 | L'app non chiede al browser di conservare i dati | Media | Minimo |
| 5 | L'import Chess.com rimanda ogni volta il mese corrente | Bassa | Piccolo |
| 6 | Un backup ripristinato non viene inviato agli altri dispositivi | Bassa | Piccolo |
| 7 | I dati arrivati dalla sincronizzazione non aggiornano subito puzzle e feedback | Bassa | Piccolo |
| 8 | Un'analisi senza la sua partita viene segnata come già elaborata | Bassa | Minimo |
| 9 | Il feedback può non accorgersi di un'analisi rifatta su un altro dispositivo | Bassa | Minimo |
| 10 | Il server non limita i tentativi sulla chiave | Bassa | Piccolo |

---

## 1. Il motore che non parte blocca l'app senza messaggi

**Cosa vede l'utente.** Il bot dello sparring non muove mai, "Controllo la mossa…" nei puzzle
non finisce, il pannello del motore resta vuoto, "Analizza tutte" resta ferma. Nessun errore;
si risolve solo chiudendo e riaprendo l'app.

**Quando succede.** Se il file del motore non si carica (rete instabile alla prima apertura,
memoria insufficiente) oppure se il motore si blocca a metà di una ricerca.

**Perché.**
- `src/engine/engine.ts`, `start`: con un solo candidato, se l'avvio fallisce il codice prosegue
  comunque e aspetta `readyok` da un motore morto. `ready` non si risolve mai, quindi ogni
  `search` resta in attesa per sempre.
- Dopo l'avvio `worker.onerror` viene azzerato: un blocco a metà ricerca non viene visto, e la
  promessa di `search` non si chiude.
- `src/engine/queue.ts`, `pump`: `running` resta occupato, quindi tutta la coda di quel motore
  si ferma.
- `src/components/analysisStore.ts`, `startBackground`: manca un `try/finally`. Se
  `analyzeAndSave` lancia un errore, `background.running` resta `true` e l'analisi non si può
  più riavviare.
- `src/components/PuzzleTrainer.tsx`: se la verifica della mossa fallisce (`() => {}`), lo stato
  resta `checking` e la scacchiera non accetta più mosse.

**Come correggere.**
1. In `Engine`: tenere `onerror` attivo per tutta la vita del motore; su errore rifiutare la
   ricerca in corso e ricreare il worker alla richiesta successiva. Se nessun candidato parte,
   far fallire `ready` invece di aspettare.
2. Un tempo massimo per l'avvio (per esempio 20 secondi), dopo il quale si mostra un messaggio.
3. `try/finally` in `startBackground` per rimettere sempre `running: false`.
4. In `PuzzleTrainer`: se la verifica fallisce, tornare allo stato `play` senza contare la
   risposta.
5. Un messaggio in italiano ("Il motore non è partito. Ricarica l'app.") dove oggi non appare
   nulla.

**Test.** Un worker finto che non risponde mai e uno che chiama `onerror` a metà ricerca
(`WorkerLike` è già pensato per questo).

---

## 2. La sincronizzazione rilegge tutto l'archivio ogni 3 minuti

**Cosa vede l'utente.** Probabili scatti periodici sul telefono, anche durante un allenamento.
Non è stato misurato: la prova di carico era senza sincronizzazione attiva.

**Perché.** `src/sync/sync.ts`, `localChanges`: per trovare le modifiche da inviare usa
`.filter((r) => r.updatedAt > after)` su ogni tabella, cioè legge e decodifica tutte le righe
(circa 2.800 partite e tutte le analisi). `syncNow` la chiama due volte per sincronizzazione.
`startAutoSync` (`src/components/syncStore.ts`) parte all'avvio, ogni 3 minuti e ogni volta che
l'app torna in primo piano.

**Come correggere.** Aggiungere l'indice `updatedAt` alle tabelle sincronizzate (nuova versione
dello schema in `src/db/schema.ts`; `analyses` ce l'ha già) e usare
`where('updatedAt').above(after)`. Stessa cosa per `tombstones`.

**Test.** Misurare prima e dopo con i dati generati della prova di carico
(`tests/perf/profile.test.ts`).

---

## 3. Un errore in una pagina dà schermo bianco

**Perché.** Non c'è nessun error boundary: `Layout` avvolge le pagine solo in `Suspense`. Se una
pagina lancia un errore durante il disegno, o se il suo file non si scarica, React smonta tutta
l'app.

**Come correggere.** Un error boundary attorno all'`Outlet` in `src/components/Layout.tsx`, con
un messaggio in italiano e un pulsante "Ricarica". La barra di navigazione deve restare
visibile.

---

## 4. L'app non chiede al browser di conservare i dati

**Perché.** Senza `navigator.storage.persist()` il browser può cancellare IndexedDB quando il
dispositivo è a corto di spazio. La sincronizzazione recupera quasi tutto, ma andrebbero persi
il token Lichess, le impostazioni del dispositivo e le modifiche non ancora inviate.

**Come correggere.** Chiamare `navigator.storage?.persist?.()` una volta all'avvio (per esempio
in `Layout`), ignorando il risultato.

---

## 5. L'import Chess.com rimanda ogni volta il mese corrente

**Perché.** Il mese del cursore viene riscaricato apposta (gli archivi arrivano in ritardo), ma
`normalizeChesscom` (`src/import/chesscom.ts`) mette `updatedAt: Date.now()` su ogni partita e
`saveGames` le riscrive tutte. Risultato: a ogni import le partite del mese tornano al server e
agli altri dispositivi, che rifanno anche l'indice delle posizioni.

**Come correggere.** In `saveGames` (`src/import/sync.ts`) saltare le partite già presenti con lo
stesso contenuto, oppure conservare il loro `updatedAt`.

---

## 6. Un backup ripristinato non viene inviato agli altri dispositivi

**Perché.** `importBackup` (`src/db/backup.ts`) conserva gli `updatedAt` originali. La
sincronizzazione invia solo ciò che è più recente di `pushedUpTo`, quindi i dati vecchi
ripristinati restano solo sul dispositivo.

**Come correggere.** Dopo un ripristino azzerare `pushedUpTo` in `syncState`: la sincronizzazione
successiva rimanda tutto e il server scarta ciò che ha già.

---

## 7. I dati arrivati dalla sincronizzazione non aggiornano subito puzzle e feedback

**Perché.** `refreshDerived` e `processFeedback` partono solo all'apertura di Home, Allenamento,
Statistiche o dopo un import. Se la sincronizzazione scarica partite o analisi mentre una pagina
è aperta, puzzle, statistiche e feedback restano quelli di prima fino alla visita successiva.

**Come correggere.** In `syncStore`, dopo una sincronizzazione con `pulled > 0`, chiamare
`refreshDerived` e `processFeedback`.

---

## 8. Un'analisi senza la sua partita viene segnata come già elaborata

**Perché.** `refreshDerived` (`src/puzzles/repo.ts`) salta le analisi di cui non trova la partita
(`if (!a || !g) return`), ma le registra comunque in `done`. Se la partita arriva dopo, i suoi
puzzle non vengono mai generati. Oggi è improbabile, perché la sincronizzazione porta le partite
prima delle analisi.

**Come correggere.** Mettere in `done` solo le analisi realmente elaborate.

---

## 9. Il feedback può non accorgersi di un'analisi rifatta su un altro dispositivo

**Perché.** L'impronta in `feedbackInputs` (`src/feedback/repo.ts`) guarda il numero di analisi e
la data dell'ultima. Un'analisi rifatta altrove ("Approfondisci") che arriva con una data più
vecchia dell'ultima locale non cambia nessuno dei due valori: il suggerimento "estendi" può
mostrare la mossa della vecchia analisi.

**Come correggere.** Si risolve insieme al punto 7, forzando il ricalcolo dopo una
sincronizzazione che ha scaricato analisi.

---

## 10. Il server non limita i tentativi sulla chiave

**Perché.** `worker/index.ts` confronta la chiave ma non conta i tentativi falliti. La sicurezza
dipende solo dalla lunghezza di `SYNC_KEY`.

**Come correggere.** Usare una chiave lunga e casuale (almeno 32 caratteri). In alternativa,
una regola di rate limiting di Cloudflare su `/api/*`, che non richiede codice.

---

## Controlli andati bene

- `npm audit --omit=dev`: 0 vulnerabilità.
- Il token Lichess e la chiave di sincronizzazione restano fuori da backup e sincronizzazione.
- OAuth verifica lo `state`; i nomi utente negli indirizzi sono codificati.
- Nessun uso di `dangerouslySetInnerHTML`.
- Paginazione del server: un gruppo di righe con lo stesso numero di sequenza non viene mai
  spezzato tra due pagine.
- Cancellazioni e reinserimenti della stessa mossa di repertorio si sincronizzano nell'ordine
  giusto.
