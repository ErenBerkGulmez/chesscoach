import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { explainMove } from "./explain";
import { buildGameReport } from "./report";
import { forkTargets, formatLine, materialSwing } from "./board";
import { parsePgnMoves } from "@/lib/chess/pgn-parser";
import type { MoveAnalysis } from "@/types/chess";
import { MoveClassification, PlayerColor } from "@/types/chess";

/** Build a MoveAnalysis for move `i` of `pgn`, with the given engine facts. */
function analysisFor(
  pgn: string,
  i: number,
  facts: {
    classification: MoveClassification;
    evalBefore?: number;
    evalAfter?: number;
    mateBefore?: number | null;
    mateAfter?: number | null;
    best?: string[];
    reply?: string[];
    bestMoveMate?: number | null;
  }
): MoveAnalysis {
  const m = parsePgnMoves(pgn)[i];
  const best = facts.best ?? [];
  const white = m.color === PlayerColor.WHITE;
  const toMover = (v: number) => (white ? v : -v);
  return {
    moveNumber: m.moveNumber,
    color: m.color,
    fen: m.fen,
    fenBefore: m.fenBefore,
    sanMove: m.san,
    uciMove: m.uci,
    evalBefore: facts.evalBefore ?? 0,
    evalAfter: facts.evalAfter ?? 0,
    evalDelta: toMover((facts.evalAfter ?? 0) - (facts.evalBefore ?? 0)),
    mateBefore: facts.mateBefore ?? null,
    mateAfter: facts.mateAfter ?? null,
    bestMove: null,
    bestMoveSan: best[0] ?? null,
    bestMoveEval: toMover(facts.evalBefore ?? 0),
    bestMoveMate: facts.bestMoveMate ?? null,
    pvLines: best.length ? [{ depth: 16, score: 0, mate: null, pv: [], pvSan: best, multipv: 1 }] : [],
    replyLine: facts.reply ?? [],
    classification: facts.classification,
    moveAccuracy: 50,
    isCapture: m.isCapture,
    isCheck: m.isCheck,
    isCastle: m.isCastle,
    isPromotion: m.isPromotion,
    isSacrifice: false,
  };
}

describe("board helpers", () => {
  it("formats lines with move numbers", () => {
    const fen = new Chess().fen();
    expect(formatLine(fen, ["e4", "e5", "Nf3"])).toBe("1.e4 e5 2.Nf3");
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    expect(formatLine(afterE4, ["e5", "Nf3"])).toBe("1...e5 2.Nf3");
  });

  it("measures material once exchanges settle", () => {
    // 1.e4 d5 2.exd5 Qxd5: even trade
    const fen = new Chess().fen();
    expect(materialSwing(fen, ["e4", "d5", "exd5", "Qxd5"], "w")).toBe(0);
  });

  it("finds a knight fork of king and rook", () => {
    const chess = new Chess("4k3/8/8/8/8/8/2n5/R3K3 w - - 0 1");
    const targets = forkTargets(chess, "c2").map((t) => t.square).sort();
    expect(targets).toEqual(["a1", "e1"]);
  });
});

describe("explainMove", () => {
  it("names a hanging piece and the capture that wins it", () => {
    // 2.Ba6?? leaves the bishop to be taken for free.
    const a = analysisFor("1. e4 e5 2. Ba6", 2, {
      classification: MoveClassification.BLUNDER,
      evalBefore: 30,
      evalAfter: -300,
      best: ["Nf3", "Nc6", "Bb5"],
      reply: ["Nxa6", "d3", "Nc5"],
    });
    const e = explainMove(a);
    expect(e.motif).toBe("hanging-piece");
    expect(e.headline).toContain("2.Ba6");
    expect(e.headline).toContain("bishop");
    expect(e.detail).toContain("2...Nxa6");
    expect(e.better?.san).toBe("Nf3");
    expect(e.takeaway).toMatch(/undefended/);
  });

  it("explains an allowed mate with the mating line", () => {
    // 3...Nf6?? allows 4.Qxf7#.
    const a = analysisFor("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6", 5, {
      classification: MoveClassification.BLUNDER,
      evalBefore: 50,
      evalAfter: 10000,
      mateAfter: 1,
      best: ["g6"],
      reply: ["Qxf7#"],
    });
    const e = explainMove(a);
    expect(e.motif).toBe("allowed-mate");
    expect(e.headline).toBe("3...Nf6 allows mate in 1");
    expect(e.detail).toContain("4.Qxf7#");
    expect(e.better?.san).toBe("g6");
  });

  it("points out a missed mate", () => {
    // White plays 4.Nc3 instead of 4.Qxf7#.
    const a = analysisFor("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Nc3", 6, {
      classification: MoveClassification.MISSED_MATE,
      evalBefore: 10000,
      mateBefore: 1,
      evalAfter: -100,
      best: ["Qxf7#"],
      bestMoveMate: 1,
      reply: ["Nxh5"],
    });
    const e = explainMove(a);
    expect(e.motif).toBe("missed-mate");
    expect(e.better?.why).toContain("mate in 1");
  });

  it("points out free material that was missed", () => {
    // After 1.e4 e5 2.Ba6, Black plays 2...d6 instead of taking the bishop.
    const a = analysisFor("1. e4 e5 2. Ba6 d6", 3, {
      classification: MoveClassification.MISTAKE,
      evalBefore: -300,
      evalAfter: 0,
      best: ["Nxa6", "Nf3", "Nc5"],
      reply: ["Bb5+", "c6"],
    });
    const e = explainMove(a);
    expect(e.motif).toBe("missed-material");
    expect(e.better?.why).toContain("bishop on a6");
  });

  it("keeps good moves short", () => {
    const a = analysisFor("1. e4", 0, { classification: MoveClassification.BEST, best: ["e4"] });
    const e = explainMove(a);
    expect(e.motif).toBeNull();
    expect(e.takeaway).toBeNull();
  });
});

describe("buildGameReport", () => {
  const pgn = "1. e4 e5 2. Ba6 d6 3. Nf3";
  const moves = parsePgnMoves(pgn);
  const analyses: MoveAnalysis[] = [
    analysisFor(pgn, 0, { classification: MoveClassification.BEST, best: ["e4"] }),
    analysisFor(pgn, 1, { classification: MoveClassification.BEST, best: ["e5"] }),
    analysisFor(pgn, 2, {
      classification: MoveClassification.BLUNDER,
      evalBefore: 30,
      evalAfter: -300,
      best: ["Nf3", "Nc6"],
      reply: ["Nxa6", "d3"],
    }),
    analysisFor(pgn, 3, {
      classification: MoveClassification.MISTAKE,
      evalBefore: -300,
      evalAfter: 0,
      best: ["Nxa6", "Nf3"],
      reply: ["Bb5+", "c6"],
    }),
    analysisFor(pgn, 4, { classification: MoveClassification.BEST, best: ["Nf3"] }),
  ];

  it("only reports the player's own mistakes", () => {
    const white = buildGameReport(analyses, PlayerColor.WHITE);
    expect(white.keyMoments.map((k) => k.index)).toEqual([2]);
    expect(white.patterns.map((p) => p.motif)).toEqual(["hanging-piece"]);
    const black = buildGameReport(analyses, PlayerColor.BLACK);
    expect(black.keyMoments.map((k) => k.index)).toEqual([3]);
    expect(black.patterns.map((p) => p.motif)).toEqual(["missed-material"]);
  });

  it("turns patterns into a prioritized focus list with move references", () => {
    const white = buildGameReport(analyses, PlayerColor.WHITE);
    expect(white.focus[0].title).toBe("Blunder-check every move");
    expect(white.focus[0].why).toContain("2.Ba6");
    expect(white.focus[0].indices).toEqual([2]);
    expect(white.verdict).toContain("2.Ba6");
    expect(moves).toHaveLength(5);
  });

  it("praises a clean game", () => {
    const clean = buildGameReport(analyses.filter((_, i) => i !== 2 && i !== 3), PlayerColor.WHITE);
    expect(clean.focus).toEqual([]);
    expect(clean.verdict).toMatch(/clean game/i);
  });
});
