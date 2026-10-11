# Chess Coach

Free, in-browser game review for Chess.com players. Enter a username, pick a game, and get a move-by-move review powered by Stockfish 18 running locally in WebAssembly, with plain-language explanations and opening statistics.

Everything runs in your browser: no account, no server, no API keys. Game data comes from the [Chess.com public API](https://www.chess.com/news/view/published-data-api).

## Features

- **Game list** for any public Chess.com account, with search, filters and sorting.
- **Game review**: interactive board, evaluation bar and graph, move classifications (best, inaccuracy, mistake, blunder, …), engine lines, and a coach panel that explains each move.
- **Explore variations** by dragging pieces on the board; the engine evaluates the new position.
- **Statistics**: results by colour and time control, and opening analytics split into the openings you choose and the ones you face.
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
├── public/stockfish/        Stockfish 18 WASM build (vendored)
└── src/
    ├── app/                 Routes: landing, dashboard, game review
    ├── components/          Board, move list, coach panel, dashboard widgets
    ├── lib/api/             Chess.com API client
    ├── lib/chess/           PGN parsing, move classification, openings
    ├── lib/engine/          Explanation rules
    ├── lib/stockfish/       Stockfish worker wrapper and game analyzer
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
