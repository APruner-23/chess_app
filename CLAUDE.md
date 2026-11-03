# CLAUDE.md — chess_app

Personal, local-first chess PWA for one user (the owner). It does two things:
- import and analyze their Chess.com and Lichess games;
- help them learn and experiment with openings through a repertoire, spaced repetition (FSRS) and automatic feedback from real games.

**Full plan (Italian): [docs/PLAN.md](docs/PLAN.md).** Read the relevant milestone before starting work.

## Working agreement
- Talk to the user in **Italian**. UI text is in Italian; code, identifiers, comments and commit messages are in English.
- Work on one milestone at a time (M0 → M6 in docs/PLAN.md). Before calling a milestone done:
  1. lint, tests and build are all green;
  2. commit and push;
  3. tick the milestone in docs/PLAN.md;
  4. write a short summary in Italian for the user: what works, how to try it, what's next.
- Cloud credits are limited and expire in November 2026, so work economically: targeted reads, no gratuitous rewrites, and run the relevant tests rather than the whole suite on every change.
- Ask before:
  - adding dependencies outside the stack below;
  - using paid services;
  - deploying or publishing;
  - anything that needs the user's accounts.

## Owner accounts (public, also used as test data)
- **Chess.com AlePruner** — main account. About 2,700 games since 2021-02: rapid ~1110, blitz ~770, bullet ~590, plus a few daily games.
- **Lichess MalVoluto** — 154 games: rapid ~1340, blitz ~1120, bullet ~1210 (provisional).
- Defaults: explorer rating band Lichess 1200–1600 (configurable); repertoire depth modest, 8–10 moves.

## Stack (decided — don't swap without asking)
- Vite 8 + React 19 + TypeScript (strict), Tailwind CSS 4, React Router, Zustand.
- Board: `@lichess-org/chessground` 10.
- Chess logic, FEN and PGN (with variations): `chessops` 0.15. Do not add chess.js.
- Engine: `stockfish` 19 (npm, nmrugg).
  - Use only the **lite single-threaded** build `stockfish-19-lite-single.js/.wasm` (decided 2026-10-12): the multi-threaded lite was ~30% faster but failed unpredictably to allocate its shared memory (after other engine instances, and offline from the service-worker cache), leaving no memory for a fallback. `Engine` still accepts a list of candidates with fallback.
  - `scripts/copy-engine.mjs` copies it from node_modules into `public/engine/` before dev and build.
  - Never commit the ~94 MB full engines. The npm package itself is over 150 MB.
  - Load with a plain `new Worker('/engine/<file>.js')`; it finds its `.wasm` by name. Verified in headless Chromium: ~245k nps, and it works offline from the PWA cache.
  - Two engine instances (`engineQueue('live' | 'analysis')` in `src/engine/instance.ts`): the position on screen never pauses game analyses. Inside a queue, `src/engine/queue.ts` priorities: `live` > `game` (analysis the user asked for) > `background`; a more urgent job stops the running one, which is re-queued.
  - Finished positions (`outcomeOf`) are never searched: the engine panel says who won, the eval bar shows 1-0 / 0-1 / ½-½.
- Storage: Dexie 4 + `dexie-react-hooks`.
- Spaced repetition: `ts-fsrs` 5 (FSRS-6, `request_retention` 0.9).
- Training (`src/training`): a card is `<repertoireId>|<epd>` for a user-to-move position with its main move; `syncAllCards` re-derives cards from the repertoire (changed main move → reset). FSRS state is stored as plain numbers (`StoredFsrs`). Due cards are grouped into lines from the start (`buildLines`): the app auto-plays the rest. "Difficili" is practice only (no scheduling, no log). "Impara" shows each line with arrows (nothing recorded), then replays it from memory without hints (`recall` lines): that attempt is the first answer. "Tutte le linee" (`drillSession`/`allLines`) is free practice on one chosen repertoire: every saved line from the start to each leaf (user plays main moves, every prepared opponent reply), all user moves quizzed, random order, nothing recorded. Training never shows the engine.
- Puzzles (`src/puzzles`): every user mistake/blunder in an analyzed game with a known better move becomes a puzzle (`extractPuzzles`; skipped if the user's win% was already < 20). The `puzzles` table is derived locally (`rebuildPuzzles`, on opening Allenamento); only `puzzleProgress` (FSRS state per puzzle) syncs and goes in backups. Scheduled session = due + up to 10 new a day (blunders and recent first); free practice by phase, nothing recorded. A move other than the engine's is checked by the live engine (depth 16) and accepted within 3 win% points; any mating move is accepted. Page `/puzzle?mode=review|practice&phase=&judgment=`; `Partita` opens at `?ply=N`.
- Background analysis ("Analizza tutte", `analysisStore`): every game without analysis, ordered by `analysisOrder` (recency bands 30/90/365 days, losses first inside a band; games under 10 plies skipped), at `BACKGROUND_NODES` (40k) per position; `Analysis.nodes` records the budget and Partita offers "Approfondisci" to redo a quick one with the user's preset. ETA from the average time per game. Optional auto-start a few seconds after launch (`autoAnalyze`, a device-only setting).
- Puzzle motifs (`src/puzzles/motifs.ts`, `classifyPuzzle`): heuristics with chessops attacks, in order: mate missed (solution mates or forced mate ≤ 5) / allowed, piece left hanging by the game move (knight or more, undefended or attacked by something cheaper), missed capture (not a recapture on the same square), fork (≥ 2 real targets), pin/skewer (slider), promotion, else endgame technique or positional. Practice can filter `?motif=`.
- Coach (`src/coach/insights.ts`, `coachReport`): last 12 months (all games if fewer than 50); ranked weaknesses with an estimated cost in points per 100 games (time losses and time trouble per cadence, tactical motifs, a phase ≥ 1.3× worse than the middlegame, openings 10 points under the average, repertoire lines leaving you ≤ −0.5, tilt, time of day, open feedback), each with an action link; strengths = openings 10 points above. Error-based insights need ≥ 10 analyzed games. Top 3 on Home, all in Statistiche (`#coach`).
- Sparring (`src/sparring/bot.ts`, page `/sparring`): games against the live engine. Strength without engine options: MultiPV 5 at a node budget per level, then a softmax on the win% each candidate gives up (`BOT_LEVELS`, 8 levels; temperature 0 = always best). Start from the initial position, the end of a random repertoire line, or `?moves=<san,…>&color=` ("Gioca da qui" in Editor and Partita). Takeback, resign, threefold/50-move draws (`gameEnd`); after the end the same page reviews the game with the engine. Sparring games are not stored.
- Endgames (`src/endgames`, page `/finali`): 14 essential positions (`ENDGAMES`, verdicts checked with Stockfish at depth 26) played against the engine at full strength (`ENDGAME_BOT`, 250k nodes, temperature 0; the engine may move first). `judgeEndgame`: mate goal = checkmate; promote = queened and still ≥ +4; draw = a draw result or 15 user moves held; a win goal fails under +2, a draw goal at −2.5 or worse (evals from the bot's own search). FSRS per exercise in `endgameProgress` (synced, backed up); today's session = due + 2 new a day. The coach sends endgame weaknesses here.
- Bot moves (`components/useBotMove.ts`): shared by sparring and endgames. With `book` on (sparring's "avversario realistico", default on, up to ply 24 and until the first engine move) the bot plays explorer moves weighted by how often players of the user's level play them (`pickBookMove`: ≥ 20 games, moves under 3% ignored), from the cache or Lichess (3 s timeout), else the engine.
- Sounds (`components/sound.ts`): synthesized with Web Audio (no files). `Board` plays move / capture (fewer pieces) / check whenever a new `lastMove` is shown; trainers play correct/wrong, endgames and sparring success/fail. Toggle `sounds` is a device-only setting, applied in `Layout`.
- Daily goal (`training/activity.ts`, `activityRepo.ts`): every answer (reviews in any mode, puzzles in any mode, endgames) counts in the synced `activity` table, one row per day and device (`deviceId`, device-only) summed per day. `dailyGoal` setting (default 20), streak of days with the goal reached (today pending until reached), 20-week calendar on Home (`GoalCard`).
- Review extras (Partita): a card for the current game move when it was judged (singular label, "migliore era …", "Mostra" plays the better move as a variation from the position before), "Momenti chiave" (`keyMoments`: the 3 biggest win% drops for the mover, ≥ 15 points), and a move list that follows the current move by scrolling only itself, shown right under the board on phones.
- Statistics (`src/stats`, page `/statistiche`, filters by cadence and period): time per move and clock left vs opponents (from `clocks`: before − after + increment), errors by think time (relative to base time) and in time trouble (< 10% of base), losses/wins on time, errors by phase, score by rating gap, time of day and previous result in the session (< 1 h apart), openings by color. Chart colors in `chartColors.ts` (user blue `#3987e5`, opponents orange `#d95926`, validated on the dark surface); bars via `components/charts.tsx`.
- Feedback (`src/feedback`): `compareGame` follows each game through the repertoires of the user's color and keeps the one followed longest. Items: `exit` (always, status `info`, used by the dashboard), plus `deviation`/`hole`/`extend` only for games played after the repertoire's `createdAt`. `processFeedback` recomputes everything and keeps the user's status. Line stats ignore games with fewer than 2 plies in book.
- Sync (`src/sync/sync.ts` + `worker/index.ts`): the same Worker serves the assets and `POST /api/sync?since=<seq>` on D1 (binding `DB`, one `records` table, last write wins by `updatedAt`, server sequence numbers for pulls). The Worker never parses pushed JSON (passed to SQLite `json_each`) because of the free plan's CPU limit. Auth: Worker secret `SYNC_KEY`, entered once per device (`syncKey` setting, device-only like the Lichess token and `syncState`). Deletions are tombstones (`tombstones` table, written by repertoire deletes). Feedback travels only for user decisions (done/ignored); cards and the rest of feedback are re-derived. Tests run the real Worker on Node's `node:sqlite` (`tests/d1.ts`).
- Home (`Dashboard.tsx`): greeting, "to do today" cards (reviews, puzzles, feedback, recent games to analyze), rating chips per site/cadence with 30-day change (`ratingChange`) and chart, recent form, repertoire lines. Opening tables live in Statistiche. Allenamento is split into sections: Aperture, Puzzle, Sparring.
- Pages are lazy-loaded (`src/components/navItems.ts`); the layout wraps the outlet in `Suspense`, so tests use `findByRole`.
- Game review (`src/pages/Partita.tsx`): the board is playable; moves that leave the game form a `variation` from the current ply (the game stays untouched), and clicking a move of an engine line plays the line up to it (`PvLineView`). The live engine is always on (no toggle). Positive move labels (`src/analysis/quality.ts`): book (< `openingPly`), best (= stored engine best, unknown for Lichess analyses), excellent (< 2 win% points lost), good (< 5); moves tried in a variation get a label too once the live engine reaches depth 12 before and after them (`classifyMove`); the current move's label is also drawn on the board as a chessground `customSvg` glyph (`Board` `glyph` prop). Destructive buttons use `ConfirmDialog`.
- The repertoire editor always shows the engine above the explorer tabs: Lichess cloud eval when cached there, else local Stockfish, plus an eval bar.
- A Black repertoire is scoped to the White first moves it answers (`isScoped` in `src/repertoire/coverage.ts`): other first moves are neither coverage holes nor feedback (a Caro-Kann repertoire ignores 1.d4 games).
- `BOARD_COLUMN` (`src/components/format.ts`) sizes boards from the viewport height on desktop.
- `Board` re-syncs to its `fen` prop after every move, because chessground applies moves locally (a wrong training answer must snap back).
- Charts: Recharts. PWA: `vite-plugin-pwa` in `prompt` mode with `clientsClaim` (a new version waits until reopen or the "Aggiorna" banner in `UpdateBanner.tsx`; `autoUpdate` swapped caches mid-session and broke lazy chunks). It precaches everything incl. engine and openings, ~3.3 MB; icons in `public/icons`, rendered from `icon.svg` with headless Chromium). JSON backup: `src/db/backup.ts` (user tables only, merge by `updatedAt`, never the Lichess token). Deploy guide: `docs/DEPLOY.md`. Tests: Vitest + `fake-indexeddb`.
- COOP/COEP headers (`same-origin` / `require-corp`; no longer required by the engine, kept for future multi-thread use) go in `vite.config.ts` (dev and preview) and in `public/_headers` (Cloudflare Pages).
- License: GPL-3.0, because chessground, chessops and stockfish are GPL.

## Conventions
- Pure logic lives in `src/{chess,import,openings,analysis,repertoire,training,feedback,lichess,db,sync}` and has unit tests. React lives only in `src/components` and `src/pages`.
- Positions are keyed by **normalized EPD**: board, turn, castling, and the en-passant square only when an en-passant capture is legal. This makes transpositions merge.
- Use **deterministic string IDs** (`lichess:<gameId>`, `chesscom:<uuid>`, `<repertoireId>|<epd>`, …) and put `updatedAt` on every user-data record. This lets the JSON backup merge now and allows Dexie Cloud sync later without migrations.
- Caches and indexes (`explorerCache`, `evalCache`, `gamePositions`) are local-only.
- Store evals from **White's point of view** (`cp` or `mate`).
- Show moves in figurine SAN (♘f3).
- The Lichess token stays local: never export, sync or log it.
- **Tests never hit the network.** Use `tests/fixtures`.

## External APIs (verified live on 2026-10-07)
- **Lichess games**
  - Endpoint: `GET https://lichess.org/api/games/user/{user}?since=&max=&opening=true&evals=true&accuracy=true&clocks=true&pgnInJson=true`, with header `Accept: application/x-ndjson`.
  - Works anonymously (20 games/s) and allows CORS.
  - From a shell, curl's default User-Agent gets a 404: send a browser-like UA.
  - `clocks` (centiseconds, after each ply) has one extra trailing entry when the game ends by resignation or timeout; `normalizeLichess` trims it.
- **Chess.com**
  - `GET https://api.chess.com/pub/player/{user}/games/archives`, then fetch each monthly URL. CORS is `*`.
  - Requests must be strictly **serial**: parallel requests get a 429.
  - Archives lag a few hours, so always re-fetch the latest month.
  - Keep only games with `rules === "chess"` and the standard start position.
- **Opening explorer** (`https://explorer.lichess.org/lichess|masters?fen=…&speeds=…&ratings=…`)
  - **Requires `Authorization: Bearer <token>`**; without it the response is 401.
  - Get the token through Lichess OAuth2 PKCE: public client, no app registration, any unique `client_id`, S256, no scopes needed. As a fallback, the user pastes a personal token in Settings.
  - One request at a time; on a 429 wait 60 s; cache responses in IndexedDB.
  - OAuth redirect URI is `<origin>/oauth` (page `src/pages/OAuth.tsx`); PKCE verifier/state live in `sessionStorage` until the callback. Token in the local `settings` table under `lichessToken`.
  - Explorer and OAuth are tested only against mocks so far (Vitest + Playwright `page.route`); first live check on the previews.
- Castling UCI: chessops and Lichess (cloud eval, explorer) use king-takes-rook (`e1h1`); Stockfish uses `e1g1`. chessops `parseUci`/`makeSan` accept both.
- **Cloud eval**: `GET https://lichess.org/api/cloud-eval?fen=…&multiPv=3` works anonymously. A 404 means the position is not in the cache.
- Lichess API spec: https://github.com/lichess-org/api (`doc/specs`).

## Analysis formulas (Lichess / lila)
For reference, see `WinPercent`, `AccuracyPercent` and `Advice` in github.com/lichess-org/lila.
- Win%: `winPercent(cp) = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`, with cp clamped to ±1000 (mate counts as ±1000).
- Move accuracy, from the mover's point of view:
  - formula: `103.1668100711649 * exp(-0.04354415386753951 * (wpBefore - wpAfter)) - 3.166924740191411`;
  - then +1 bonus, clamped to 0–100;
  - 100 if win% did not drop.
- Game accuracy per color: the average of two means of the move accuracies, the volatility-weighted mean and the harmonic mean.
  - Window size = clamp(plies/10, 2, 8).
  - Weight = standard deviation of win% inside the window, clamped to 0.5–12.
  - The eval list starts with the initial position (lila `Cp.initial`).
- Judgments use the mover's drop in winning chances (−1…1 scale): ≥0.1 inaccuracy, ≥0.2 mistake, ≥0.3 blunder. That is 5/10/15 win% points. Mate-related advice is handled separately.
- In the Lichess export, `analysis[i]` is the eval **after** ply i+1 (White's point of view). Judged plies also carry `best`, `variation` and `judgment`.
- Findings from the cross-check (2026-10-11), implemented in `src/analysis`:
  - Lichess only judges plies that carry a server `variation`/`best`; `judgeMoves` takes a `judged(ply)` filter, used for Lichess evals.
  - CpAdvice does **not** clamp cp to ±1000 (a +5764 eval is judged as a blunder); accuracy does clamp.
  - When a game ends in checkmate, Lichess has no eval for the final position (n−1 evals); `analyzeGame` does the same.
  - Game `1FaVySeC` (37 mate evals) gives White 51.3 vs Lichess 54; every other game matches within ±0.3. Unexplained, tolerated in the test.
- **Cross-check test**: for the games in `tests/fixtures/lichess/malvoluto-analysed.ndjson`, recomputing from `analysis` must reproduce `players.{white,black}.analysis`: accuracy within ±1, and the same inaccuracy/mistake/blunder counts.

## Fixtures & data
- `tests/fixtures/lichess/`
  - `malvoluto-recent.ndjson` — the 30 most recent games (bullet and blitz; 4 have server analysis).
  - `malvoluto-analysed.ndjson` — 5 games with full server analysis and accuracy.
  - `user-malvoluto.json`, `cloud-eval-after-e4.json`.
- `tests/fixtures/chesscom/`
  - `alepruner-2026-09.json` — 87 games, 35 of them with `accuracies`.
  - `alepruner-archives.json`, `alepruner-stats.json`.
- `data/chess-openings/{a..e}.tsv` — the lichess-org/chess-openings dataset (CC0; columns `eco`, `name`, `pgn`).
  - `npm run build-openings` (`scripts/build-openings.ts`) turns it into `src/openings/openings.json`, an EPD → {eco, name} map. The JSON is committed and lazy-loaded as its own chunk.
  - A game is classified by the deepest match along its moves.

## Commands (available after M0)
`npm run dev` · `npm run build` · `npm run preview` · `npm test` · `npm run lint` · `npm run build-openings`

Tests are typechecked through `tsconfig.test.json` (Node types allowed there, not in `src`). A headless Chromium smoke test can mock the APIs with Playwright `page.route` and the fixtures; Playwright is installed globally (`npm root -g`), not in the project.

## Cloud environment notes
- The network may be restricted: npm and GitHub should work, lichess.org and api.chess.com may not. Live API checks happen on the previews the user chooses at the end of M1, unless those domains are allowlisted.
- There is no browser pane in the cloud. Rely on Vitest, and use Playwright headless only if it is available.
