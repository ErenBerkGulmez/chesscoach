/**
 * The player's own opening tree: every move sequence they have reached with
 * one colour, with how many games went that way and how they scored.
 */
import type { ParsedGame } from '@/types/chess';
import { GameResult, PlayerColor } from '@/types/chess';
import { positionKey, type OpeningBook } from './opening-book';

export interface OpeningTreeNode {
  /** Moves from the start, joined with spaces. Unique within a tree. */
  path: string;
  san: string;
  /** Half-moves from the start: 1 is the first move by White. */
  ply: number;
  /** "1.e4" or "1...c5". */
  label: string;
  /** Name of this exact position, when the book has one. */
  name: string | null;
  eco: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Points scored out of 100: a win is 1, a draw is a half. */
  score: number;
  /** Average evaluation after move 10 in pawns, from the player's side. Null without reviewed games. */
  evalAtTen: number | null;
  /** How many games behind `evalAtTen`. */
  evalGames: number;
  gameIds: string[];
  children: OpeningTreeNode[];
}

export interface OpeningTree {
  color: PlayerColor;
  games: number;
  /** Games of this colour that have an evaluation after move 10. */
  reviewed: number;
  children: OpeningTreeNode[];
}

export interface OpeningTreeOptions {
  /** How many half-moves deep the tree goes. */
  maxPly?: number;
  /** Evaluation after move 10 per game id, in pawns from White's side. */
  evals?: Map<string, number>;
}

interface Building extends OpeningTreeNode {
  evalSum: number;
  byMove: Map<string, Building>;
}

function newNode(path: string, san: string, ply: number): Building {
  const moveNumber = Math.ceil(ply / 2);
  return {
    path,
    san,
    ply,
    label: ply % 2 === 1 ? `${moveNumber}.${san}` : `${moveNumber}...${san}`,
    name: null,
    eco: null,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    score: 0,
    evalAtTen: null,
    evalGames: 0,
    gameIds: [],
    children: [],
    evalSum: 0,
    byMove: new Map(),
  };
}

function finish(node: Building): OpeningTreeNode {
  const children = [...node.byMove.values()]
    .sort((a, b) => b.games - a.games || a.san.localeCompare(b.san))
    .map(finish);
  return {
    path: node.path,
    san: node.san,
    ply: node.ply,
    label: node.label,
    name: node.name,
    eco: node.eco,
    games: node.games,
    wins: node.wins,
    draws: node.draws,
    losses: node.losses,
    score: node.games ? Math.round(((node.wins + node.draws / 2) / node.games) * 100) : 0,
    evalAtTen: node.evalGames ? Math.round((node.evalSum / node.evalGames) * 100) / 100 : null,
    evalGames: node.evalGames,
    gameIds: node.gameIds,
    children,
  };
}

export function buildOpeningTree(
  games: ParsedGame[],
  color: PlayerColor,
  book: OpeningBook | null,
  options: OpeningTreeOptions = {}
): OpeningTree {
  const maxPly = options.maxPly ?? 12;
  const root = new Map<string, Building>();
  let total = 0;
  let reviewed = 0;

  for (const game of games) {
    if (game.playerColor !== color || game.moves.length === 0) continue;
    total++;
    const white = options.evals?.get(game.id);
    const evalForPlayer = white === undefined ? undefined : color === PlayerColor.WHITE ? white : -white;
    if (evalForPlayer !== undefined) reviewed++;

    let level = root;
    let path = '';
    const depth = Math.min(maxPly, game.moves.length);
    for (let i = 0; i < depth; i++) {
      const move = game.moves[i];
      path = path ? `${path} ${move.san}` : move.san;
      let node = level.get(move.san);
      if (!node) {
        node = newNode(path, move.san, i + 1);
        const entry = book?.get(positionKey(move.fen));
        if (entry) {
          node.name = entry.name;
          node.eco = entry.eco;
        }
        level.set(move.san, node);
      }
      node.games++;
      if (game.result === GameResult.WIN) node.wins++;
      else if (game.result === GameResult.LOSS) node.losses++;
      else node.draws++;
      if (evalForPlayer !== undefined) {
        node.evalSum += evalForPlayer;
        node.evalGames++;
      }
      node.gameIds.push(game.id);
      level = node.byMove;
    }
  }

  const children = [...root.values()]
    .sort((a, b) => b.games - a.games || a.san.localeCompare(b.san))
    .map(finish);
  return { color, games: total, reviewed, children };
}

/** The most-played line from the top, as node paths. Used to open the tree at a useful depth. */
export function mainLine(tree: OpeningTree, depth: number): string[] {
  const out: string[] = [];
  let level = tree.children;
  for (let i = 0; i < depth && level.length > 0; i++) {
    out.push(level[0].path);
    level = level[0].children;
  }
  return out;
}
