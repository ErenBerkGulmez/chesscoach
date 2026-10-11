import { describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import type { EvalResult } from "./engine";

// Fake engine: for each FEN, the "best move" is the first legal move in
// chess.js order, with a fixed score. That lets the test tell apart lines
// for the position before a move from lines for the position after it.
function fakeLines(fen: string): EvalResult[] {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  if (legal.length === 0) return [];
  const m = legal[0];
  return [{ depth: 10, score: 20, mate: null, pv: [m.from + m.to + (m.promotion ?? "")], multipv: 1 }];
}

vi.mock("./engine", () => ({
  StockfishEngine: class {
    async init() {}
    async evaluate(fen: string) {
      return fakeLines(fen);
    }
    destroy() {}
  },
}));

import { analyzeGame } from "./analyzer";
import { parsePgnMoves } from "@/lib/chess/pgn-parser";
import { PlayerColor } from "@/types/chess";

const moves = parsePgnMoves("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6");

describe("analyzeGame best move", () => {
  it("suggests a move for the side that just moved, from the position before the move", async () => {
    const result = await analyzeGame(moves, "g1");
    result.moves.forEach((a, i) => {
      const expected = fakeLines(moves[i].fenBefore)[0].pv[0];
      expect(a.bestMove).toBe(expected);
      // and it must be a legal move in the position before the move
      const chess = new Chess(moves[i].fenBefore);
      expect(() => chess.move({ from: expected.slice(0, 2), to: expected.slice(2, 4) })).not.toThrow();
      expect(a.pvLines[0].pv[0]).toBe(expected);
    });
  });
});

describe("analyzeGame accuracy", () => {
  it("only counts the player's moves", async () => {
    const asWhite = await analyzeGame(moves, "g1", { playerColor: PlayerColor.WHITE });
    const asBlack = await analyzeGame(moves, "g1", { playerColor: PlayerColor.BLACK });
    const avg = (c: PlayerColor) => {
      const xs = asWhite.moves.filter((m) => m.color === c).map((m) => m.moveAccuracy);
      return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
    };
    expect(asWhite.accuracy).toBe(avg(PlayerColor.WHITE));
    expect(asBlack.accuracy).toBe(avg(PlayerColor.BLACK));
    const total = (r: typeof asWhite) => Object.values(r.classificationCounts).reduce((a, b) => a + b, 0);
    expect(total(asWhite)).toBe(3);
    expect(total(asBlack)).toBe(3);
  });
});

describe("evaluatePositions", () => {
  it("returns results in input order when spread over several workers", async () => {
    const { evaluatePositions } = await import("./analyzer");
    const fens = [moves[0].fenBefore, ...moves.map((m) => m.fen)];
    const seen: number[] = [];
    const out = await evaluatePositions(fens, { depth: 8, multiPv: 1, workers: 3, onResult: (i) => seen.push(i) });
    expect(out).toHaveLength(fens.length);
    out.forEach((lines, i) => expect(lines).toEqual(fakeLines(fens[i])));
    expect([...seen].sort((a, b) => a - b)).toEqual(fens.map((_, i) => i));
  });

  it("stops when aborted", async () => {
    const { evaluatePositions } = await import("./analyzer");
    const controller = new AbortController();
    controller.abort();
    await expect(
      evaluatePositions([moves[0].fen], { depth: 8, multiPv: 1, workers: 1, signal: controller.signal })
    ).rejects.toThrow("aborted");
  });
});

describe("analyzeGame refinement", () => {
  it("reports a preliminary result before the deeper pass and keeps every move", async () => {
    const prelim: number[] = [];
    const result = await analyzeGame(moves, "g1", {
      depth: 8,
      refineDepth: 12,
      onPreliminary: (a) => prelim.push(a.moves.length),
    });
    expect(prelim).toEqual([moves.length]);
    expect(result.moves).toHaveLength(moves.length);
    expect(result.engineDepth).toBe(12);
  });

  it("skips the preliminary callback when refinement is off", async () => {
    const prelim: number[] = [];
    await analyzeGame(moves, "g1", { depth: 10, refineDepth: 10, onPreliminary: () => prelim.push(1) });
    expect(prelim).toEqual([]);
  });
});
