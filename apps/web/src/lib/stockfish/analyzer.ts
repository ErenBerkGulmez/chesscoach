/**
 * Full Game Analyzer
 * 
 * Orchestrates Stockfish analysis for every move in a game.
 * Produces MoveAnalysis[] with classifications and evaluations.
 */

import { Chess } from 'chess.js';
import { StockfishEngine, type EvalResult } from '@/lib/stockfish/engine';
import { classifyMove, calculateMoveAccuracy, type ClassificationInput } from '@/lib/chess/move-classifier';
import { getGamePhase } from '@/lib/chess/pgn-parser';
import type { MoveAnalysis, ParsedMove, GameAnalysis } from '@/types/chess';
import { MoveClassification, PlayerColor, AnalysisStatus } from '@/types/chess';

export interface AnalyzerOptions {
  depth: number;
  multiPv: number;
  threads: number;
  onProgress?: (moveIndex: number, totalMoves: number, currentEval: EvalResult[]) => void;
  onMoveAnalyzed?: (analysis: MoveAnalysis) => void;
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
    const startEval = await engine.evaluate(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      { depth: opts.depth, multiPv: opts.multiPv }
    );
    if (startEval.length > 0) {
      prevEval = startEval[0].score;
      prevMate = startEval[0].mate;
    }

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
      const bestMoveUci = evalResults[0]?.pv[0] ?? null;
      const bestMoveEval = evalBeforeNorm;
      const bestMoveMate = mateBeforeNorm;
      const isEngineBestMove = false;

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
      const pvSanLines = evalResults.map((ev) => ({
        ...ev,
        pvSan: uciPvToSan(move.fenBefore, ev.pv),
      }));

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
        bestMoveSan: bestMoveUci ? uciToSan(move.fenBefore, bestMoveUci) : null,
        bestMoveEval: bestMoveEval,
        bestMoveMate: bestMoveMate,

        pvLines: pvSanLines,

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
    }

    // Calculate aggregates
    const playerMoves = moveAnalyses;
    const accuracies = playerMoves.map((m) => m.moveAccuracy);
    const avgAccuracy = accuracies.length > 0
      ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
      : 0;

    const cplValues = playerMoves
      .filter((m) => m.evalDelta !== null)
      .map((m) => Math.max(0, -(m.evalDelta ?? 0)));
    const avgCpl = cplValues.length > 0
      ? cplValues.reduce((a, b) => a + b, 0) / cplValues.length
      : 0;

    // Classification counts
    const classificationCounts = Object.values(MoveClassification).reduce(
      (acc, cls) => {
        acc[cls] = playerMoves.filter((m) => m.classification === cls).length;
        return acc;
      },
      {} as Record<MoveClassification, number>
    );

    // Phase accuracies
    const phaseAccuracies = calculatePhaseAccuracies(moveAnalyses, moves);

    return {
      gameId,
      engineDepth: opts.depth,
      engineVersion: 'Stockfish 18 WASM',
      moves: moveAnalyses,
      averageCpl: Math.round(avgCpl),
      accuracy: Math.round(avgAccuracy * 10) / 10,
      openingAccuracy: phaseAccuracies.opening,
      middlegameAccuracy: phaseAccuracies.middlegame,
      endgameAccuracy: phaseAccuracies.endgame,
      classificationCounts,
      status: AnalysisStatus.COMPLETED,
      analyzedAt: new Date(),
    };
  } finally {
    engine.destroy();
  }
}

/**
 * Convert a UCI move to SAN notation given a FEN position.
 */
function uciToSan(fen: string, uciMove: string): string | null {
  try {
    const chess = new Chess(fen);
    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    const promotion = uciMove.length > 4 ? uciMove[4] : undefined;
    
    const move = chess.move({ from, to, promotion });
    return move?.san ?? null;
  } catch {
    return null;
  }
}

/**
 * Convert an array of UCI moves (PV line) to SAN notation.
 */
function uciPvToSan(startFen: string, uciMoves: string[]): string[] {
  const chess = new Chess(startFen);
  const sanMoves: string[] = [];

  for (const uci of uciMoves) {
    try {
      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);
      const promotion = uci.length > 4 ? uci[4] : undefined;
      
      const move = chess.move({ from, to, promotion });
      if (move) {
        sanMoves.push(move.san);
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return sanMoves;
}

/**
 * Calculate accuracy by game phase (opening, middlegame, endgame).
 */
function calculatePhaseAccuracies(
  analyses: MoveAnalysis[],
  moves: ParsedMove[]
): { opening: number | null; middlegame: number | null; endgame: number | null } {
  const phases = { opening: [] as number[], middlegame: [] as number[], endgame: [] as number[] };

  for (let i = 0; i < analyses.length; i++) {
    const move = moves[i];
    if (!move) continue;
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
