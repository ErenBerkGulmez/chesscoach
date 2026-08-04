import { create } from 'zustand';
import type {
  ParsedGame,
  ParsedMove,
  MoveAnalysis,
  GameAnalysis,
  BoardArrow,
} from '@/types/chess';
import { ExplanationLevel, PlayerColor } from '@/types/chess';
import { StockfishEngine, type EvalResult } from '@/lib/stockfish/engine';
import { classifyMove, calculateMoveAccuracy, type ClassificationInput } from '@/lib/chess/move-classifier';
import { MoveClassification } from '@/types/chess';
import type { Square } from 'chess.js';
import { Chess } from 'chess.js';

let sharedEngine: StockfishEngine | null = null;

async function getSharedEngine(depth: number): Promise<StockfishEngine> {
  if (!sharedEngine) {
    sharedEngine = new StockfishEngine();
  }
  if (sharedEngine.getState() === 'idle') {
    await sharedEngine.init({ depth, multiPv: 3, threads: 2 });
  }
  return sharedEngine;
}

interface FenEval {
  score: number;
  mate: number | null;
  bestMove: string | null;
  bestMoveSan: string | null;
  pvLines: EvalResult[];
  depth: number;
}

interface AnalysisState {
  currentGame: ParsedGame | null;
  moves: ParsedMove[];

  currentMoveIndex: number;
  isFlipped: boolean;
  showArrows: boolean;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  arrows: BoardArrow[];
  highlightSquares: Record<string, { backgroundColor: string }>;

  gameAnalysis: GameAnalysis | null;
  moveAnalyses: Record<number, MoveAnalysis>;
  fenCache: Record<string, FenEval>;
  isAnalyzing: boolean;
  analysisProgress: number;
  analysisError: string | null;

  aiExplanation: string | null;
  aiLoading: boolean;
  explanationLevel: ExplanationLevel;

  customFen: string | null;
  customMoveSan: string | null;
  customAnalysis: MoveAnalysis | null;

  isExploring: boolean;
  explorationMoves: string[];
  explorationIndex: number;
  explorationFens: string[];

  setGame: (game: ParsedGame) => void;
  clearGame: () => void;

  goToMove: (index: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  goForward: () => void;
  goBackward: () => void;
  flipBoard: () => void;
  toggleArrows: () => void;
  toggleCoordinates: () => void;
  setArrows: (arrows: BoardArrow[]) => void;

  analyzeMove: (index: number, targetDepth?: number) => Promise<MoveAnalysis | null>;
  setAnalysis: (analysis: GameAnalysis) => void;
  setMoveAnalyses: (analyses: MoveAnalysis[]) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setAnalysisProgress: (progress: number) => void;
  setAnalysisError: (error: string | null) => void;

  setAiExplanation: (explanation: string | null) => void;
  setAiLoading: (loading: boolean) => void;
  setExplanationLevel: (level: ExplanationLevel) => void;

  makeCustomMove: (from: Square, to: Square, promotion?: string) => Promise<boolean>;
  resetCustomMove: () => void;

  startExploration: (movesList: string[], startFen: string) => void;
  stepForwardExploration: () => void;
  stepBackwardExploration: () => void;
  exitExploration: () => void;

  getCurrentMove: () => ParsedMove | null;
  getCurrentMoveAnalysis: () => MoveAnalysis | null;
  getPlayerMoveAnalyses: () => MoveAnalysis[];
}

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  currentGame: null,
  moves: [],
  currentMoveIndex: -1,
  isFlipped: false,
  showArrows: true,
  showCoordinates: true,
  showLegalMoves: false,
  arrows: [],
  highlightSquares: {},

  customFen: null,
  customMoveSan: null,
  customAnalysis: null,

  isExploring: false,
  explorationMoves: [],
  explorationIndex: -1,
  explorationFens: [],

  gameAnalysis: null,
  moveAnalyses: {},
  fenCache: {},
  isAnalyzing: false,
  analysisProgress: 0,
  analysisError: null,

  aiExplanation: null,
  aiLoading: false,
  explanationLevel: ExplanationLevel.INTERMEDIATE,

  setGame: (game) =>
    set({
      currentGame: game,
      moves: game.moves,
      currentMoveIndex: -1,
      customFen: null,
      customMoveSan: null,
      customAnalysis: null,
      isExploring: false,
      explorationMoves: [],
      explorationIndex: -1,
      explorationFens: [],
      gameAnalysis: null,
      moveAnalyses: {},
      isAnalyzing: false,
      analysisProgress: 0,
      analysisError: null,
      aiExplanation: null,
      arrows: [],
      highlightSquares: {},
      isFlipped: game.playerColor === PlayerColor.BLACK,
    }),

  clearGame: () =>
    set({
      currentGame: null,
      moves: [],
      currentMoveIndex: -1,
      customFen: null,
      customMoveSan: null,
      customAnalysis: null,
      isExploring: false,
      explorationMoves: [],
      explorationIndex: -1,
      explorationFens: [],
      gameAnalysis: null,
      moveAnalyses: {},
      isAnalyzing: false,
      analysisProgress: 0,
      analysisError: null,
      aiExplanation: null,
      arrows: [],
      highlightSquares: {},
    }),

  goToMove: (index) => {
    const { moves, moveAnalyses, showArrows, isAnalyzing } = get();
    const clampedIndex = Math.max(-1, Math.min(index, moves.length - 1));

    const highlights: Record<string, { backgroundColor: string }> = {};
    if (clampedIndex >= 0) {
      const move = moves[clampedIndex];
      const uci = move.uci;
      const from = uci.substring(0, 2) as Square;
      const to = uci.substring(2, 4) as Square;
      highlights[from] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
      highlights[to] = { backgroundColor: 'rgba(129, 182, 76, 0.45)' };
    }

    const newArrows: BoardArrow[] = [];
    if (showArrows && clampedIndex >= 0 && moveAnalyses[clampedIndex]) {
      const analysis = moveAnalyses[clampedIndex];
      if (analysis.bestMove && analysis.bestMove !== analysis.uciMove) {
        newArrows.push({
          from: analysis.bestMove.substring(0, 2) as Square,
          to: analysis.bestMove.substring(2, 4) as Square,
          color: 'rgba(0, 128, 0, 0.6)',
        });
      }
    }

    set({
      currentMoveIndex: clampedIndex,
      isExploring: false,
      explorationMoves: [],
      explorationIndex: -1,
      explorationFens: [],
      customFen: null,
      customMoveSan: null,
      customAnalysis: null,
      highlightSquares: highlights,
      arrows: newArrows,
      aiExplanation: null,
    });

    if (clampedIndex >= 0 && !moveAnalyses[clampedIndex] && !isAnalyzing) {
      get().analyzeMove(clampedIndex);
    }
  },

  goToStart: () => get().goToMove(-1),
  goToEnd: () => get().goToMove(get().moves.length - 1),
  goForward: () => get().goToMove(get().currentMoveIndex + 1),
  goBackward: () => get().goToMove(get().currentMoveIndex - 1),

  flipBoard: () => set((state) => ({ isFlipped: !state.isFlipped })),
  toggleArrows: () => set((state) => ({ showArrows: !state.showArrows })),
  toggleCoordinates: () =>
    set((state) => ({ showCoordinates: !state.showCoordinates })),
  setArrows: (arrows) => set({ arrows }),

  analyzeMove: async (index, targetDepth = 14) => {
    const { moves, fenCache } = get();
    if (index < 0 || index >= moves.length) return null;

    const move = moves[index];

    const evaluateFen = async (fen: string): Promise<FenEval> => {
      if (fenCache[fen] && fenCache[fen].depth >= targetDepth) {
        return fenCache[fen];
      }

      const engine = await getSharedEngine(targetDepth);
      const results = await engine.evaluate(fen, { depth: targetDepth, multiPv: 3 });
      const best = results[0];

      const isWhiteToMove = fen.includes(' w ');
      const rawScore = best?.score ?? 0;
      const rawMate = best?.mate ?? null;

      const whiteScore = isWhiteToMove ? rawScore : -rawScore;
      const whiteMate = rawMate !== null ? (isWhiteToMove ? rawMate : -rawMate) : null;

      const evalData: FenEval = {
        score: whiteScore,
        mate: whiteMate,
        bestMove: best?.pv[0] ?? null,
        bestMoveSan: best?.pv[0] ? uciToSan(fen, best.pv[0]) : null,
        pvLines: results,
        depth: targetDepth,
      };

      set((state) => ({
        fenCache: { ...state.fenCache, [fen]: evalData },
      }));

      return evalData;
    };

    try {
      const evalBefore = await evaluateFen(move.fenBefore);
      const evalAfter = await evaluateFen(move.fen);
      const isWhiteMove = move.color === PlayerColor.WHITE;

      const beforeScoreNorm = isWhiteMove ? evalBefore.score : -evalBefore.score;
      const beforeMateNorm = evalBefore.mate !== null ? (isWhiteMove ? evalBefore.mate : -evalBefore.mate) : null;
      const afterScoreNorm = isWhiteMove ? evalAfter.score : -evalAfter.score;
      const afterMateNorm = evalAfter.mate !== null ? (isWhiteMove ? evalAfter.mate : -evalAfter.mate) : null;

      const isEngineBestMove = evalBefore.bestMove === move.uci;

      const classInput: ClassificationInput = {
        evalBefore: beforeScoreNorm,
        mateBefore: beforeMateNorm,
        evalAfter: afterScoreNorm,
        mateAfter: afterMateNorm,
        bestMoveEval: beforeScoreNorm,
        bestMoveMate: beforeMateNorm,
        isEngineBestMove,
        playedMove: move.uci,
        bestMove: evalBefore.bestMove || move.uci,
        isWhiteMove,
        pvLines: evalAfter.pvLines,
        isCapture: move.isCapture,
      };

      const classification = classifyMove(classInput);
      const moveAccuracy = calculateMoveAccuracy(
        beforeScoreNorm,
        afterScoreNorm,
        beforeMateNorm,
        afterMateNorm
      );

      const evalDelta = afterScoreNorm - beforeScoreNorm;

      const analysis: MoveAnalysis = {
        moveNumber: move.moveNumber,
        color: move.color,
        fen: move.fen,
        fenBefore: move.fenBefore,
        sanMove: move.san,
        uciMove: move.uci,
        evalBefore: evalBefore.score,
        evalAfter: evalAfter.score,
        evalDelta,
        mateBefore: evalBefore.mate,
        mateAfter: evalAfter.mate,
        bestMove: evalBefore.bestMove,
        bestMoveSan: evalBefore.bestMoveSan,
        bestMoveEval: evalBefore.score,
        bestMoveMate: evalBefore.mate,
        pvLines: evalAfter.pvLines.map((l) => ({
          ...l,
          pvSan: l.pv.map((m) => uciToSan(move.fenBefore, m) || m),
        })),
        classification,
        moveAccuracy,
        isCapture: move.isCapture,
        isCheck: move.isCheck,
        isCastle: move.isCastle,
        isPromotion: move.isPromotion,
        isSacrifice: false,
      };

      set((state) => ({
        moveAnalyses: { ...state.moveAnalyses, [index]: analysis },
      }));

      if (get().currentMoveIndex === index && !get().isExploring) {
        const highlights: Record<string, { backgroundColor: string }> = {};
        const from = move.uci.substring(0, 2) as Square;
        const to = move.uci.substring(2, 4) as Square;
        highlights[from] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
        highlights[to] = { backgroundColor: 'rgba(129, 182, 76, 0.45)' };

        const newArrows: BoardArrow[] = [];
        if (analysis.bestMove && analysis.bestMove !== analysis.uciMove && get().showArrows) {
          newArrows.push({
            from: analysis.bestMove.substring(0, 2) as Square,
            to: analysis.bestMove.substring(2, 4) as Square,
            color: 'rgba(0, 128, 0, 0.6)',
          });
        }

        set({
          highlightSquares: highlights,
          arrows: newArrows,
        });
      }

      return analysis;
    } catch (e) {
      console.error('[Store] Failed to lazily analyze move:', e);
      return null;
    }
  },

  setAnalysis: (analysis) => set({ gameAnalysis: analysis }),

  setMoveAnalyses: (analyses) => {
    const record: Record<number, MoveAnalysis> = {};
    analyses.forEach((a, idx) => {
      record[idx] = a;
    });
    set({ moveAnalyses: record });
  },

  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setAnalysisProgress: (progress) => set({ analysisProgress: progress }),
  setAnalysisError: (error) => set({ analysisError: error }),

  setAiExplanation: (explanation) => set({ aiExplanation: explanation }),
  setAiLoading: (loading) => set({ aiLoading: loading }),
  setExplanationLevel: (level) => set({ explanationLevel: level }),

  makeCustomMove: async (from: Square, to: Square, promotion?: string) => {
    const { currentMoveIndex, moves, customFen, isAnalyzing } = get();
    const currentFen =
      customFen ??
      (currentMoveIndex < 0
        ? STARTING_FEN
        : moves[currentMoveIndex]?.fen ?? STARTING_FEN);

    try {
      const chess = new Chess(currentFen);
      const moveObj = chess.move({ from, to, promotion: promotion || 'q' });
      if (!moveObj) return false;

      const newFen = chess.fen();
      const isWhiteMove = moveObj.color === 'w';
      const playerColor = isWhiteMove ? PlayerColor.WHITE : PlayerColor.BLACK;

      const highlights: Record<string, { backgroundColor: string }> = {};
      highlights[from] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
      highlights[to] = { backgroundColor: 'rgba(129, 182, 76, 0.45)' };

      set({
        customFen: newFen,
        customMoveSan: moveObj.san,
        highlightSquares: highlights,
        arrows: [],
      });

      if (!isAnalyzing) {
        try {
          const engine = await getSharedEngine(12);
          const results = await engine.evaluate(newFen, { depth: 12, multiPv: 3 });
          const best = results[0];

          const isWhiteToMove = newFen.includes(' w ');
          const rawScore = best?.score ?? 0;
          const rawMate = best?.mate ?? null;

          const whiteScore = isWhiteToMove ? rawScore : -rawScore;
          const whiteMate = rawMate !== null ? (isWhiteToMove ? rawMate : -rawMate) : null;

          const customAnalysis: MoveAnalysis = {
            moveNumber: Math.floor((moves.length + 1) / 2),
            color: playerColor,
            fen: newFen,
            fenBefore: currentFen,
            sanMove: moveObj.san,
            uciMove: `${from}${to}${promotion || ''}`,
            evalBefore: 0,
            evalAfter: whiteScore,
            evalDelta: 0,
            mateBefore: null,
            mateAfter: whiteMate,
            bestMove: best?.pv[0] ?? null,
            bestMoveSan: best?.pv[0] ? uciToSan(currentFen, best.pv[0]) : null,
            bestMoveEval: whiteScore,
            bestMoveMate: whiteMate,
            pvLines: results.map((l) => ({
              ...l,
              pvSan: l.pv.map((m) => uciToSan(currentFen, m) || m),
            })),
            classification: MoveClassification.GOOD,
            moveAccuracy: 100,
            isCapture: !!moveObj.captured,
            isCheck: chess.isCheck(),
            isCastle: moveObj.san === 'O-O' || moveObj.san === 'O-O-O',
            isPromotion: !!moveObj.promotion,
            isSacrifice: false,
          };

          set({ customAnalysis });
        } catch (err) {
          console.warn('[Store] Engine evaluation error for custom move:', err);
        }
      }

      return true;
    } catch {
      return false;
    }
  },

  resetCustomMove: () => {
    set({ customFen: null, customMoveSan: null, customAnalysis: null, isExploring: false, explorationMoves: [], explorationIndex: -1, explorationFens: [] });
    const { currentMoveIndex } = get();
    get().goToMove(currentMoveIndex);
  },

  startExploration: (movesList, startFen) => {
    const fens: string[] = [startFen];
    try {
      const chess = new Chess(startFen);
      for (const moveStr of movesList) {
        let result = null;
        try {
          result = chess.move(moveStr);
        } catch {
          if (moveStr.length >= 4) {
            const from = moveStr.substring(0, 2) as Square;
            const to = moveStr.substring(2, 4) as Square;
            const promotion = moveStr.length > 4 ? moveStr[4] : undefined;
            result = chess.move({ from, to, promotion });
          }
        }
        if (result) {
          fens.push(chess.fen());
        } else {
          break;
        }
      }
    } catch {}

    set({
      isExploring: true,
      explorationMoves: movesList,
      explorationIndex: movesList.length,
      explorationFens: fens,
      customFen: fens[fens.length - 1] || startFen,
    });
  },

  stepForwardExploration: () => {
    const { isExploring, explorationIndex, explorationFens } = get();
    if (!isExploring) return;
    const nextIndex = Math.min(explorationIndex + 1, explorationFens.length - 1);
    set({
      explorationIndex: nextIndex,
      customFen: explorationFens[nextIndex] || null,
    });
  },

  stepBackwardExploration: () => {
    const { isExploring, explorationIndex, explorationFens } = get();
    if (!isExploring) return;
    const prevIndex = Math.max(0, explorationIndex - 1);
    set({
      explorationIndex: prevIndex,
      customFen: explorationFens[prevIndex] || null,
    });
  },

  exitExploration: () => {
    set({
      isExploring: false,
      explorationMoves: [],
      explorationIndex: -1,
      explorationFens: [],
      customFen: null,
    });
    const { currentMoveIndex } = get();
    get().goToMove(currentMoveIndex);
  },

  getCurrentMove: () => {
    const { moves, currentMoveIndex } = get();
    if (currentMoveIndex < 0) return null;
    return moves[currentMoveIndex] ?? null;
  },

  getCurrentMoveAnalysis: () => {
    const { moveAnalyses, currentMoveIndex, customAnalysis } = get();
    if (customAnalysis) return customAnalysis;
    if (currentMoveIndex < 0) return null;
    return moveAnalyses[currentMoveIndex] ?? null;
  },

  getPlayerMoveAnalyses: () => {
    const { moveAnalyses, currentGame } = get();
    if (!currentGame) return [];
    return Object.values(moveAnalyses).filter((m) => m.color === currentGame.playerColor);
  },
}));

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
