import { describe, expect, it } from "vitest";
import { bestFromBefore, summarizePlayerMoves, uciLineToSan } from "./summary";
import { MoveClassification, PlayerColor, type MoveAnalysis } from "@/types/chess";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const mk = (color: PlayerColor, moveAccuracy: number, classification: MoveClassification, evalDelta = 0) =>
  ({ color, moveAccuracy, classification, evalDelta }) as unknown as MoveAnalysis;

describe("summarizePlayerMoves", () => {
  it("ignores the opponent's moves", () => {
    const moves = [
      mk(PlayerColor.WHITE, 90, MoveClassification.BEST),
      mk(PlayerColor.BLACK, 10, MoveClassification.BLUNDER, -500),
      mk(PlayerColor.WHITE, 70, MoveClassification.GOOD, -40),
    ];
    const s = summarizePlayerMoves(moves, PlayerColor.WHITE);
    expect(s.accuracy).toBe(80);
    expect(s.averageCpl).toBe(20);
    expect(s.classificationCounts[MoveClassification.BLUNDER]).toBe(0);
    expect(s.classificationCounts[MoveClassification.BEST]).toBe(1);
    expect(summarizePlayerMoves(moves, PlayerColor.BLACK).accuracy).toBe(10);
  });

  it("returns 0 when the player has no analyzed moves", () => {
    expect(summarizePlayerMoves([], PlayerColor.WHITE).accuracy).toBe(0);
  });
});

describe("bestFromBefore", () => {
  it("takes the best move and SAN lines from the position before the move", () => {
    const r = bestFromBefore(START, [
      { depth: 10, score: 30, mate: null, pv: ["e2e4", "e7e5", "g1f3"], multipv: 1 },
    ]);
    expect(r.bestMove).toBe("e2e4");
    expect(r.bestMoveSan).toBe("e4");
    expect(r.pvLines[0].pvSan).toEqual(["e4", "e5", "Nf3"]);
  });

  it("handles empty engine output", () => {
    expect(bestFromBefore(START, []).bestMove).toBeNull();
  });
});

describe("uciLineToSan", () => {
  it("stops at the first illegal move", () => {
    expect(uciLineToSan(START, ["e2e4", "e2e4"])).toEqual(["e4"]);
  });
});
