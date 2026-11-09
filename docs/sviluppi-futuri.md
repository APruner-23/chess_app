# Sviluppi futuri

Idee scritte il 2026-11-09, in ordine di utilità rispetto allo sforzo. Prima di queste conviene
chiudere i problemi 1–4 di [bug.md](bug.md).

| # | Idea | Utilità | Sforzo |
|---|---|---|---|
| 1 | Controllo automatico su GitHub a ogni push | Alta | Piccolo |
| 2 | "Le partite di oggi" | Alta | Medio |
| 3 | Riscaldamento da 5 minuti | Media | Piccolo |
| 4 | Rapporto settimanale | Media | Piccolo |
| 5 | Partite modello per ogni linea | Media | Medio |
| 6 | Puzzle "Cosa minaccia?" | Media | Medio |
| 7 | Allenamento sulla gestione del tempo | Media | Medio |
| 8 | Promemoria dell'obiettivo giornaliero | Media | Grande |
| 9 | Esportazioni | Bassa | Piccolo |

---

## 1. Controllo automatico su GitHub a ogni push

**Idea.** Oggi i controlli (lint, test, build) partono solo se chi fa il commit se ne ricorda, e
ogni push su `main` va online da solo. Due volte è finita online una versione con test rotti.

**Come.** Un workflow di GitHub Actions (`.github/workflows/ci.yml`) che esegue `npm ci`,
`npm run lint`, `npm test` e `npm run build` a ogni push e pull request. È gratuito per questo
uso. Per bloccare davvero le versioni rotte: lavorare su un ramo e far pubblicare Cloudflare
solo da `main`, unendo quando il controllo è verde.

---

## 2. "Le partite di oggi"

**Idea.** Dopo aver giocato apri l'app e trovi già tutto pronto: le partite nuove importate e
analizzate, e una scheda in Home con le 3 lezioni della giornata.

**Come.**
- Import automatico all'apertura, al massimo una volta ogni ora (oggi è manuale, `importStore`).
- Le partite nuove passano davanti a tutte nell'analisi in background (`analysisOrder`).
- La scheda prende i 3 cali più forti delle partite del giorno (`keyMoments`) e li collega al
  puzzle corrispondente o alla revisione della partita.

**Attenzione.** L'import Chess.com oggi riscrive tutto il mese: sistemare prima il punto 5 di
`bug.md`.

---

## 3. Riscaldamento da 5 minuti

**Idea.** Una sessione breve prima di giocare: 5 ripassi delle aperture, 3 puzzle, 1 finale.

**Come.** Un pulsante in Home che mette in fila le tre sessioni esistenti (`Trainer`,
`PuzzleTrainer`, `EndgameTrainer`) con limiti ridotti. Le risposte contano come sempre per
FSRS e per l'obiettivo giornaliero.

---

## 4. Rapporto settimanale

**Idea.** Ogni lunedì una scheda: partite giocate, variazione di rating per cadenza, giorni con
obiettivo raggiunto, l'errore più ricorrente della settimana e un consiglio.

**Come.** Riusa `coachReport` limitato agli ultimi 7 giorni, `ratingChange` e `dailyTotals`.
Niente dati nuovi da salvare: si calcola al momento.

---

## 5. Partite modello per ogni linea

**Idea.** Conoscere le mosse non basta: servono i piani. Per ogni linea del repertorio, mostrare
alcune partite di maestri che la giocano, da scorrere nella revisione.

**Come.** L'explorer dei maestri di Lichess restituisce già le partite principali per posizione
(`topGames`); la partita si scarica in PGN da Lichess. Si apre in una vista di sola lettura con
la scacchiera e il motore, senza salvarla. Richiede il token Lichess, come l'explorer.

---

## 6. Puzzle "Cosa minaccia?"

**Idea.** Molti errori gravi nascono dal non guardare la mossa dell'avversario. Dalle partite in
cui hai lasciato un pezzo in presa: ti viene mostrata la posizione dopo la tua mossa e devi
trovare la risposta che ti ha punito.

**Come.** Un nuovo tipo di puzzle derivato dagli stessi dati (`extractPuzzles`, motivo "pezzo
lasciato in presa"): la soluzione è la migliore risposta dell'avversario, che l'analisi conosce
già (`best` della mossa successiva). Stesso allenatore, con la scacchiera dal lato avversario.

---

## 7. Allenamento sulla gestione del tempo

**Idea.** Le statistiche dicono già dove perdi tempo; manca un esercizio. Puzzle a tempo: la
posizione viene dalle tue partite, il cronometro parte dal tempo che avevi davvero in quel
momento.

**Come.** I puzzle hanno già `gameId` e `ply`; il tempo si ricava da `clocks`. Una modalità di
pratica libera con conto alla rovescia, senza effetti su FSRS.

---

## 8. Promemoria dell'obiettivo giornaliero

**Idea.** Una notifica la sera se l'obiettivo del giorno non è raggiunto.

**Come.** È la più complessa: servono le notifiche push (iscrizione dal telefono, chiavi VAPID,
un'attività programmata nel Worker di Cloudflare che invia la notifica). Su iPhone funziona solo
con l'app installata nella schermata Home. Il Worker non conosce l'attività del giorno senza
leggere i dati sincronizzati, quindi serve anche una piccola lettura dal database D1.

---

## 9. Esportazioni

- Una partita in PGN con valutazioni e commenti dell'analisi, da aprire in Lichess.
- Un repertorio come studio Lichess (l'esportazione PGN esiste già in `repertoire/pgnIO.ts`).

---

## Manutenzione

- Aggiornare le dipendenze due volte l'anno ed eseguire `npm audit`.
- Controllare ogni tanto i limiti del piano gratuito di Cloudflare (richieste al Worker, righe
  scritte su D1): con un solo utente c'è ampio margine.
- Fare un backup JSON da Impostazioni prima di ogni cambio dello schema del database.
