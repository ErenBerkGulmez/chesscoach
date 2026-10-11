/**
 * Full Game Analyzer
 * 
 * Orchestrates Stockfish analysis for every move in a game.
 * Produces MoveAnalysis[] with classifications and evaluations.
 */

import { StockfishEngine, type EvalResult } from '@/lib/stockfish/engine';
import { classifyMove, calculateMoveAccuracy, type ClassificationInput } from '@/lib/chess/move-classifier';
import { bestFromBefore, summarizePlayerMoves } from '@/lib/analysis/summary';
import { getGamePhase } from '@/lib/chess/pgn-parser';
import type { MoveAnalysis, ParsedMove, GameAnalysis } from '@/types/chess';
import { PlayerColor, AnalysisStatus } from '@/types/chess';

export interface AnalyzerOptions {
  depth: number;
  multiPv: number;
  threads: number;
  onProgress?: (moveIndex: number, totalMoves: number, currentEval: EvalResult[]) => void;
  onMoveAnalyzed?: (analysis: MoveAnalysis) => void;
  /** Side whose moves count towards accuracy and classification counts. Defaults to White. */
  playerColor?: PlayerColor;
  signal?: AbortSignal;
}

const DEFAULT_ANALYZER_OPTIONS: AnalyzerOptions = {
  depth: 20,
  multiPv: 3,
  threads: 2,
};

/**
 * Analyze a complete game, producing analysis for every move.
 */
export async function analyzeGame(
  moves: ParsedMove[],
  gameId: string,
  options: Partial<AnalyzerOptions> = {}
): Promise<GameAnalysis> {
  const opts = { ...DEFAULT_ANALYZER_OPTIONS, ...options };
  const engine = new StockfishEngine();
  
  try {
    await engine.init({
      depth: opts.depth,
      multiPv: opts.multiPv,
      threads: opts.threads,
    });

    const moveAnalyses: MoveAnalysis[] = [];
    let prevEval: number | null = 0; // Start position is ~0
    let prevMate: number | null = null;

    // First, evaluate the starting position
    const startFen = moves[0]?.fenBefore ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const startEval = await engine.evaluate(
      startFen,
      { depth: opts.depth, multiPv: opts.multiPv }
    );
    if (startEval.length > 0) {
      // Raw scores are from the side to move; store them from White's side.
      const whiteToMove = startFen.includes(' w ');
      prevEval = whiteToMove ? startEval[0].score : -startEval[0].score;
      prevMate = startEval[0].mate !== null ? (whiteToMove ? startEval[0].mate : -startEval[0].mate) : null;
    }
    // Engine lines for the position BEFORE the current move.
    let beforeLines: EvalResult[] = startEval;

    for (let i = 0; i < moves.length; i++) {
      // Check for abort
      if (opts.signal?.aborted) {
        throw new Error('Analysis aborted');
      }

      const move = moves[i];
      const isWhiteMove = move.color === PlayerColor.WHITE;

      // Report progress
      opts.onProgress?.(i, moves.length, []);

      // Evaluate position AFTER this move
      const evalResults = await engine.evaluate(
        move.fen,
        { depth: opts.depth, multiPv: opts.multiPv },
        (progress) => opts.onProgress?.(i, moves.length, progress)
      );

      // Get the best eval line for the position after the move
      const bestLine = evalResults[0];
      const evalAfterRaw = bestLine?.score ?? 0;
      const mateAfterRaw = bestLine?.mate ?? null;

      // Normalize evaluation of position AFTER move i to White's absolute perspective
      // If move i is White's move, move.fen has 'b' (Black to move), so raw eval is Black's perspective (-raw).
      // If move i is Black's move, move.fen has 'w' (White to move), so raw eval is White's perspective (+raw).
      const evalAfterWhite = isWhiteMove ? -evalAfterRaw : evalAfterRaw;
      const mateAfterWhite = mateAfterRaw !== null ? (isWhiteMove ? -mateAfterRaw : mateAfterRaw) : null;

      // Normalize evaluations to the MOVING side's perspective for move classification
      const evalBeforeNorm = prevEval !== null
        ? (isWhiteMove ? prevEval : -prevEval)
        : null;
      const mateBeforeNorm = prevMate !== null
        ? (isWhiteMove ? prevMate : -prevMate)
        : null;
      const evalAfterNorm = isWhiteMove ? evalAfterWhite : -evalAfterWhite;
      const mateAfterNorm = mateAfterWhite !== null ? (isWhiteMove ? mateAfterWhite : -mateAfterWhite) : null;

      // Get the engine's best move for the position BEFORE this move
      // (evalResults are for the position AFTER the move, i.e. the opponent's replies.)
      const before = bestFromBefore(move.fenBefore, beforeLines);
      const bestMoveUci = before.bestMove;
      const bestMoveEval = evalBeforeNorm;
      const bestMoveMate = mateBeforeNorm;
      const isEngineBestMove = bestMoveUci !== null && bestMoveUci === move.uci;

      // Build classification input
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
        pvLines: evalResults,
        isCapture: move.isCapture,
      };

      // Calculate CPL (centipawn loss from moving side's perspective)
      const evalDelta = evalBeforeNorm !== null && evalAfterNorm !== null
        ? evalAfterNorm - evalBeforeNorm
        : 0;

      const classification = classifyMove(classInput);
      const moveAccuracy = calculateMoveAccuracy(
        evalBeforeNorm,
        evalAfterNorm,
        mateBeforeNorm,
        mateAfterNorm
      );

      // Convert PV to SAN notation

      const analysis: MoveAnalysis = {
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
        bestMoveEval: bestMoveEval,
        bestMoveMate: bestMoveMate,

        pvLines: before.pvLines,

        classification,
        moveAccuracy,

        isCapture: move.isCapture,
        isCheck: move.isCheck,
        isCastle: move.isCastle,
        isPromotion: move.isPromotion,
        isSacrifice: false,
      };

      moveAnalyses.push(analysis);
      opts.onMoveAnalyzed?.(analysis);

      // Store current eval for next iteration (in White's absolute perspective)
      prevEval = evalAfterWhite;
      prevMate = mateAfterWhite;
      beforeLines = evalResults;
    }

    // Aggregates count only the player's moves, never the opponent's.
    const playerColor = opts.playerColor ?? PlayerColor.WHITE;
    const summary = summarizePlayerMoves(moveAnalyses, playerColor);

    // Phase accuracies
    const phaseAccuracies = calculatePhaseAccuracies(moveAnalyses, moves, playerColor);

    return {
      gameId,
      engineDepth: opts.depth,
      engineVersion: 'Stockfish 18 WASM',
      moves: moveAnalyses,
      averageCpl: summary.averageCpl,
      accuracy: summary.accuracy,
      openingAccuracy: phaseAccuracies.opening,
      middlegameAccuracy: phaseAccuracies.middlegame,
      endgameAccuracy: phaseAccuracies.endgame,
      classificationCounts: summary.classificationCounts,
      status: AnalysisStatus.COMPLETED,
      analyzedAt: new Date(),
    };
  } finally {
    engine.destroy();
  }
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

  return {
    opening: phases.opening.length > 0
      ? Math.round(phases.opening.reduce((a, b) => a + b, 0) / phases.opening.length * 10) / 10
      : null,
    middlegame: phases.middlegame.length > 0
      ? Math.round(phases.middlegame.reduce((a, b) => a + b, 0) / phases.middlegame.length * 10) / 10
      : null,
    endgame: phases.endgame.length > 0
      ? Math.round(phases.endgame.reduce((a, b) => a + b, 0) / phases.endgame.length * 10) / 10
      : null,
  };
}
