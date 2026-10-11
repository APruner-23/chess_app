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
  - Use only the **lite** builds: `stockfish-19-lite.js/.wasm` (multi-thread, needs `crossOriginIsolated`), otherwise `stockfish-19-lite-single.js/.wasm`.
  - `scripts/copy-engine.mjs` copies them from node_modules into `public/engine/` before dev and build.
  - Never commit the ~94 MB full engines. The npm package itself is over 150 MB.
  - Load with a plain `new Worker('/engine/<file>.js')`; it finds its `.wasm` by name. Verified in headless Chromium: lite multi-thread ~300k nps with 3 threads.
  - `src/engine/queue.ts` priorities: `live` (position on screen) > `game` (analysis the user asked for) > `background`; a more urgent job stops the running one, which is re-queued.
- Storage: Dexie 4 + `dexie-react-hooks`.
- Spaced repetition: `ts-fsrs` 5 (FSRS-6, `request_retention` 0.9).
- Charts: Recharts. PWA: `vite-plugin-pwa`. Tests: Vitest + `fake-indexeddb`.
- COOP/COEP headers (`same-origin` / `require-corp`) go in `vite.config.ts` (dev and preview) and in `public/_headers` (Cloudflare Pages).
- License: GPL-3.0, because chessground, chessops and stockfish are GPL.

## Conventions
- Pure logic lives in `src/{chess,import,openings,analysis,repertoire,training,feedback,lichess,db}` and has unit tests. React lives only in `src/components` and `src/pages`.
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
