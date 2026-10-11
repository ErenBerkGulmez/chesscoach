/**
 * Full Game Analyzer
 *
 * Evaluates every position of a game with a small pool of Stockfish workers
 * running in parallel, then re-checks the critical moments at a higher depth.
 *
 *   pass 1: every position at `depth` (fast, enough to find the swings)
 *   pass 2: positions around moves that lost or missed material at
 *           `refineDepth`, so the moves the coach talks about are reliable
 *
 * Positions are independent, so splitting them across workers is safe.
 */

import { StockfishEngine, type EvalResult } from '@/lib/stockfish/engine';
import { classifyMove, calculateMoveAccuracy, type ClassificationInput } from '@/lib/chess/move-classifier';
import { bestFromBefore, summarizePlayerMoves } from '@/lib/analysis/summary';
import { getGamePhase } from '@/lib/chess/pgn-parser';
import type { MoveAnalysis, ParsedMove, GameAnalysis } from '@/types/chess';
import { PlayerColor, AnalysisStatus, MoveClassification } from '@/types/chess';

export interface AnalyzerOptions {
  /** Depth used for every position in the first pass. */
  depth: number;
  /** Depth used to re-check critical moments. Set equal to `depth` to disable. */
  refineDepth: number;
  multiPv: number;
  /** Number of engine workers. Defaults to a value based on the device. */
  workers?: number;
  onProgress?: (done: number, total: number) => void;
  onMoveAnalyzed?: (analysis: MoveAnalysis) => void;
  /** Called with the first-pass result, before critical moves are re-checked. */
  onPreliminary?: (analysis: GameAnalysis) => void;
  /** Side whose moves count towards accuracy and classification counts. Defaults to White. */
  playerColor?: PlayerColor;
  signal?: AbortSignal;
}

export const DEFAULT_ANALYZER_OPTIONS: AnalyzerOptions = {
  depth: 12,
  refineDepth: 16,
  multiPv: 2,
};

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Classifications whose positions are re-checked at the refine depth. */
const CRITICAL = new Set<MoveClassification>([
  MoveClassification.INACCURACY,
  MoveClassification.MISTAKE,
  MoveClassification.BLUNDER,
  MoveClassification.MISSED_WIN,
  MoveClassification.MISSED_MATE,
]);

/** How many workers this device can run without starving the UI. */
export function defaultWorkerCount(): number {
  if (typeof navigator === 'undefined') return 1;
  const cores = navigator.hardwareConcurrency || 2;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowMemory = nav.deviceMemory !== undefined && nav.deviceMemory <= 4;
  const cap = lowMemory ? 2 : 4;
  return Math.max(1, Math.min(cap, cores - 1));
}

/**
 * Evaluate a list of positions in parallel. Results come back in the same
 * order as `fens`. `onResult` fires as each position finishes.
 */
export async function evaluatePositions(
  fens: string[],
  opts: {
    depth: number;
    multiPv: number;
    workers: number;
    signal?: AbortSignal;
    onResult?: (index: number, lines: EvalResult[]) => void;
  }
): Promise<EvalResult[][]> {
  const results: EvalResult[][] = new Array(fens.length);
  if (fens.length === 0) return results;

  const count = Math.max(1, Math.min(opts.workers, fens.length));
  const hash = count > 1 ? 16 : undefined;
  const engines = Array.from({ length: count }, () => new StockfishEngine());
  let next = 0;

  try {
    await Promise.all(
      engines.map((e) => e.init({ multiPv: opts.multiPv, ...(hash ? { hash } : {}) }))
    );
    await Promise.all(
      engines.map(async (engine) => {
        while (next < fens.length) {
          if (opts.signal?.aborted) throw new Error('Analysis aborted');
          const i = next++;
          const lines = await engine.evaluate(fens[i], { depth: opts.depth, multiPv: opts.multiPv });
          results[i] = lines;
          opts.onResult?.(i, lines);
        }
      })
    );
  } finally {
    engines.forEach((e) => e.destroy());
  }
  return results;
}

/**
 * Turn engine lines into per-move analysis.
 * `lines[0]` is for the start position, `lines[i + 1]` for the position after move i.
 */
export function buildMoveAnalyses(moves: ParsedMove[], lines: EvalResult[][]): MoveAnalysis[] {
  const out: MoveAnalysis[] = [];
  const startFen = moves[0]?.fenBefore ?? START_FEN;
  const startLines = lines[0] ?? [];
  const whiteStarts = startFen.includes(' w ');
  let prevEval: number | null = startLines[0] ? (whiteStarts ? startLines[0].score : -startLines[0].score) : 0;
  let prevMate: number | null =
    startLines[0]?.mate != null ? (whiteStarts ? startLines[0].mate : -startLines[0].mate) : null;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const isWhiteMove = move.color === PlayerColor.WHITE;
    const beforeLines = lines[i] ?? [];
    const afterLines = lines[i + 1] ?? [];

    // Raw scores are from the side to move after the move, i.e. the opponent.
    const best = afterLines[0];
    const evalAfterRaw = best?.score ?? 0;
    const mateAfterRaw = best?.mate ?? null;
    const evalAfterWhite = isWhiteMove ? -evalAfterRaw : evalAfterRaw;
    const mateAfterWhite = mateAfterRaw !== null ? (isWhiteMove ? -mateAfterRaw : mateAfterRaw) : null;

    // Normalize to the moving side for classification.
    const evalBeforeNorm = prevEval !== null ? (isWhiteMove ? prevEval : -prevEval) : null;
    const mateBeforeNorm = prevMate !== null ? (isWhiteMove ? prevMate : -prevMate) : null;
    const evalAfterNorm = isWhiteMove ? evalAfterWhite : -evalAfterWhite;
    const mateAfterNorm = mateAfterWhite !== null ? (isWhiteMove ? mateAfterWhite : -mateAfterWhite) : null;

    const before = bestFromBefore(move.fenBefore, beforeLines);
    const bestMoveUci = before.bestMove;
    const isEngineBestMove = bestMoveUci !== null && bestMoveUci === move.uci;

    const classInput: ClassificationInput = {
      evalBefore: evalBeforeNorm,
      mateBefore: mateBeforeNorm,
      evalAfter: evalAfterNorm,
      mateAfter: mateAfterNorm,
      bestMoveEval: evalBeforeNorm,
      bestMoveMate: mateBeforeNorm,
      isEngineBestMove,
      playedMove: move.uci,
      bestMove: bestMoveUci || move.uci,
      isWhiteMove,
      pvLines: afterLines,
      isCapture: move.isCapture,
    };

    const evalDelta = evalBeforeNorm !== null && evalAfterNorm !== null ? evalAfterNorm - evalBeforeNorm : 0;

    out.push({
      moveNumber: move.moveNumber,
      color: move.color,
      fen: move.fen,
      fenBefore: move.fenBefore,
      sanMove: move.san,
      uciMove: move.uci,
      evalBefore: prevEval,
      evalAfter: evalAfterWhite,
      evalDelta,
      mateBefore: prevMate,
      mateAfter: mateAfterWhite,
      bestMove: bestMoveUci,
      bestMoveSan: before.bestMoveSan,
      bestMoveEval: evalBeforeNorm,
      bestMoveMate: mateBeforeNorm,
      pvLines: before.pvLines,
      classification: classifyMove(classInput),
      moveAccuracy: calculateMoveAccuracy(evalBeforeNorm, evalAfterNorm, mateBeforeNorm, mateAfterNorm),
      isCapture: move.isCapture,
      isCheck: move.isCheck,
      isCastle: move.isCastle,
      isPromotion: move.isPromotion,
      isSacrifice: false,
    });

    prevEval = evalAfterWhite;
    prevMate = mateAfterWhite;
  }
  return out;
}

/** Position indices (into the `lines` array) worth re-checking deeper. */
export function criticalPositions(analyses: MoveAnalysis[]): number[] {
  const set = new Set<number>();
  analyses.forEach((a, i) => {
    if (CRITICAL.has(a.classification) || Math.abs(a.evalDelta ?? 0) >= 100) {
      set.add(i); // position before the move: the better move
      set.add(i + 1); // position after the move: the punishment
    }
  });
  return [...set].sort((a, b) => a - b);
}

/**
 * Analyze a complete game, producing analysis for every move.
 */
export async function analyzeGame(
  moves: ParsedMove[],
  gameId: string,
  options: Partial<AnalyzerOptions> = {}
): Promise<GameAnalysis> {
  const opts = { ...DEFAULT_ANALYZER_OPTIONS, ...options };
  const workers = opts.workers ?? defaultWorkerCount();
  const fens = [moves[0]?.fenBefore ?? START_FEN, ...moves.map((m) => m.fen)];

  // Progress covers pass 1; pass 2 runs while the preliminary result is shown.
  let done1 = 0;
  const lines = await evaluatePositions(fens, {
    depth: opts.depth,
    multiPv: opts.multiPv,
    workers,
    signal: opts.signal,
    onResult: () => {
      done1++;
      opts.onProgress?.(done1, fens.length);
    },
  });

  let analyses = buildMoveAnalyses(moves, lines);
  const playerColor = opts.playerColor ?? PlayerColor.WHITE;

  if (opts.refineDepth > opts.depth) {
    opts.onPreliminary?.(toGameAnalysis(gameId, moves, analyses, playerColor, opts.depth));
    const critical = criticalPositions(analyses);
    const deeper = await evaluatePositions(
      critical.map((i) => fens[i]),
      { depth: opts.refineDepth, multiPv: opts.multiPv, workers, signal: opts.signal }
    );
    critical.forEach((pos, k) => {
      if (deeper[k] && deeper[k].length > 0) lines[pos] = deeper[k];
    });
    analyses = buildMoveAnalyses(moves, lines);
  }

  analyses.forEach((a) => opts.onMoveAnalyzed?.(a));
  opts.onProgress?.(fens.length, fens.length);

  return toGameAnalysis(
    gameId,
    moves,
    analyses,
    playerColor,
    opts.refineDepth > opts.depth ? opts.refineDepth : opts.depth
  );
}

function toGameAnalysis(
  gameId: string,
  moves: ParsedMove[],
  analyses: MoveAnalysis[],
  playerColor: PlayerColor,
  engineDepth: number
): GameAnalysis {
  // Aggregates count only the player's moves, never the opponent's.
  const summary = summarizePlayerMoves(analyses, playerColor);
  const phaseAccuracies = calculatePhaseAccuracies(analyses, moves, playerColor);

  return {
    gameId,
    engineDepth,
    engineVersion: 'Stockfish 18 WASM',
    moves: analyses,
    averageCpl: summary.averageCpl,
    accuracy: summary.accuracy,
    openingAccuracy: phaseAccuracies.opening,
    middlegameAccuracy: phaseAccuracies.middlegame,
    endgameAccuracy: phaseAccuracies.endgame,
    classificationCounts: summary.classificationCounts,
    status: AnalysisStatus.COMPLETED,
    analyzedAt: new Date(),
  };
}

/**
 * Calculate accuracy by game phase (opening, middlegame, endgame).
 */
function calculatePhaseAccuracies(
  analyses: MoveAnalysis[],
  moves: ParsedMove[],
  playerColor: PlayerColor
): { opening: number | null; middlegame: number | null; endgame: number | null } {
  const phases = { opening: [] as number[], middlegame: [] as number[], endgame: [] as number[] };

  for (let i = 0; i < analyses.length; i++) {
    const move = moves[i];
    if (!move || analyses[i].color !== playerColor) continue;
    const phase = getGamePhase(move.fenBefore, move.moveNumber);
    phases[phase].push(analyses[i].moveAccuracy);
  }

  const avg = (xs: number[]) =>
    xs.length > 0 ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
  return { opening: avg(phases.opening), middlegame: avg(phases.middlegame), endgame: avg(phases.endgame) };
}
