# Chess Coach

Free, in-browser game review for Chess.com players. Enter a username, pick a game, and get a move-by-move review powered by Stockfish 18 running locally in WebAssembly, with plain-language explanations and opening statistics.

Everything runs in your browser: no account, no server, no API keys. Game data comes from the [Chess.com public API](https://www.chess.com/news/view/published-data-api). The only other outside service is the Lichess tablebase, which the endgame trainer asks about positions with seven pieces or fewer.

## Features

- **Game list** for any public Chess.com account, with search, filters and sorting.
- **Game review**: interactive board, evaluation bar and graph, move classifications (best, inaccuracy, mistake, blunder, …), engine lines, and a coach panel that explains each move.
- **Explore variations** by dragging pieces on the board; the engine evaluates the new position.
- **Clock-aware coaching**: the coach shows how much time you had left on each move and the game report counts the costly mistakes you made in time trouble.
- **Statistics**: results by colour and time control, and opening analytics split into the openings you choose and the ones you face.
- **Opening tree**: every line you have reached as White or Black, with games, score and the evaluation after move 10. Openings are named by position, so transpositions get the right name.
- **Weakness profile**: analyzes your last 50 games in the background (pause and resume any time) and ranks six skills by the winning chances each one costs you per game, with examples that open the move.
- **Training** (the Train page):
  - **Mistake deck**: the costly mistakes from your own games as "find a better move" cards, scheduled with spaced repetition.
  - **Win it again**: winning positions you did not win, played out against Stockfish.
  - **Visualization**: read a short line without the pieces moving, then answer a question about the final position.
  - **Guess the move**: play the winner's side of classic games, scored against the move that was played.
  - **Puzzles**: 30,000 puzzles sorted by skill, aimed at your biggest weakness, with a puzzle rating per skill.
  - **Threat spotter**: tap everything that is in danger before you choose a move.
  - **Endgames**: textbook positions and endgames from your own games, checked move by move against the tablebase.
  - **Opening drill**: positions you keep reaching and getting wrong, five minutes a day.
  - **Progress**: blunders per 100 moves, winning chances lost per move, accuracy by phase and your practice, week by week.
  - The deck exports to PGN with comments and arrows, ready to import into a Lichess study.
- Dark and light themes; keyboard navigation (`←` `→` `Home` `End`, `F` to flip).

## How the review works

1. Each position is evaluated by Stockfish (MultiPV) in a Web Worker.
2. Moves are classified from the change in evaluation from the mover's point of view, and accuracy is derived from the change in win probability.
3. A deterministic rules layer (`src/lib/engine`) turns the engine output into explanations. It does not use an LLM, so the same position always gets the same explanation.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Zustand · chess.js · react-chessboard · Recharts · Stockfish 18 WASM · Vitest

## Project layout

```
apps/web/
├── public/stockfish/        Stockfish 18 WASM build (vendored, GPL-3.0, see NOTICE.txt)
├── public/openings/         Opening names by position (built by scripts/build-openings.mjs)
├── public/puzzles/          Puzzle shards, gzipped (built by scripts/build-puzzles.mjs)
├── scripts/                 Data build scripts, not shipped with the app
└── src/
    ├── app/                 Routes: landing, dashboard, game review
    ├── components/          Board, move list, coach panel, dashboard widgets
    ├── lib/api/             Chess.com API client
    ├── lib/chess/           PGN parsing, move classification, openings
    ├── lib/engine/          Explanation rules
    ├── lib/stockfish/       Stockfish worker wrapper and game analyzer
    ├── lib/storage/         IndexedDB database (analysis cache and training data)
    ├── lib/training/        Weakness profile, mistake deck and the other trainers
    ├── stores/              Zustand stores
    └── types/               Shared types
```

## Getting started

Requires Node.js 20.9 or later.

```bash
git clone https://github.com/ErenBerkGulmez/chesscoach.git
cd chesscoach/apps/web
npm install
npm run dev
```

Open http://localhost:3000 and enter a Chess.com username.

## Scripts

Run from `apps/web` (or from the repository root, which forwards to it):

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit tests (Vitest) |

CI runs lint, typecheck, tests and build on every pull request.

## License

Chess Coach is free software, licensed under the [GNU General Public License v3.0](LICENSE) or (at your option) any later version.

It includes and builds on:

- **Stockfish 18** via [Stockfish.js](https://github.com/nmrugg/stockfish.js), GPL-3.0. See [`apps/web/public/stockfish/NOTICE.txt`](apps/web/public/stockfish/NOTICE.txt) for the notice and source links.
- **[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)**, MIT, for scheduling the mistake deck.
- **Puzzles** from the [Lichess puzzle database](https://database.lichess.org/#puzzles), released under CC0.
- **Endgame verdicts** from the [Lichess tablebase API](https://github.com/lichess-org/lila-tablebase), queried from your browser while you use the endgame trainer.
- **Opening names** from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), released into the public domain under CC0.
