# chess_app

Web app personale (una PWA che gira tutta nel browser). Serve a due cose:
- **analizzare con Stockfish** le partite giocate su Chess.com e Lichess;
- **imparare e sperimentare aperture**, con repertorio, ripetizione spaziata (FSRS) e feedback automatico dalle partite reali.

**Stato:** in sviluppo.
- Piano e milestone: [docs/PLAN.md](docs/PLAN.md)
- Guida tecnica: [CLAUDE.md](CLAUDE.md)

**Licenza:** GPL-3.0, perché le dipendenze chessground, chessops e stockfish sono GPL.

**Dataset aperture:** [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), licenza CC0, in `data/chess-openings/`.
