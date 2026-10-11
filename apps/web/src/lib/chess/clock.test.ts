import { describe, expect, it } from "vitest";
import { baseTimeMs, formatClock, isTimeTrouble, parseClocks } from "./clock";
import { parsePgnMoves } from "./pgn-parser";
import { explainMove } from "@/lib/coach/explain";
import { buildGameReport } from "@/lib/coach/report";
import type { MoveAnalysis } from "@/types/chess";
import { MoveClassification, PlayerColor } from "@/types/chess";

const HEADERS = `[Event "Live Chess"]
[White "me"]
[Black "them"]
[TimeControl "180"]

`;

// A Chess.com style PGN: every move carries the mover's remaining time.
const PGN =
  HEADERS +
  "1. e4 {[%clk 0:02:59.9]} 1... e5 {[%clk 0:02:58]} 2. Qh5 {[%clk 0:00:12.4]} 2... Nc6 {[%clk 0:02:50]} " +
  "3. Bc4 {[%clk 0:00:07]} 3... Nf6 {[%clk 0:02:41]} 4. Qxf7# {[%clk 0:00:05.1]} 1-0";

describe("parseClocks", () => {
  it("reads every clock in move order", () => {
    expect(parseClocks(PGN)).toEqual([179900, 178000, 12400, 170000, 7000, 161000, 5100]);
  });

  it("reads hours", () => {
    expect(parseClocks("1. e4 {[%clk 1:30:00]}")).toEqual([5400000]);
  });

  it("returns nothing for a PGN without clocks", () => {
    expect(parseClocks("1. e4 e5 2. Nf3")).toEqual([]);
  });
});

describe("parsePgnMoves", () => {
  it("attaches the clock to each move", () => {
    const moves = parsePgnMoves(PGN);
    expect(moves.map((m) => m.san)).toEqual(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]);
    expect(moves.map((m) => m.clockMs)).toEqual([179900, 178000, 12400, 170000, 7000, 161000, 5100]);
  });

  it("leaves clocks out when the PGN has none", () => {
    const moves = parsePgnMoves("1. e4 e5 2. Nf3");
    expect(moves).toHaveLength(3);
    expect(moves.every((m) => m.clockMs === undefined)).toBe(true);
  });

  it("ignores clocks that do not line up with the moves", () => {
    const moves = parsePgnMoves("1. e4 {[%clk 0:03:00]} 1... e5 2. Nf3 {[%clk 0:02:55]}");
    expect(moves).toHaveLength(3);
    expect(moves.every((m) => m.clockMs === undefined)).toBe(true);
  });
});

describe("clock helpers", () => {
  it("reads the starting time from a time control", () => {
    expect(baseTimeMs("600")).toBe(600000);
    expect(baseTimeMs("180+2")).toBe(180000);
    expect(baseTimeMs("1/86400")).toBeNull();
    expect(baseTimeMs(undefined)).toBeNull();
  });

  it("formats clocks", () => {
    expect(formatClock(7400)).toBe("0:07");
    expect(formatClock(750000)).toBe("12:30");
    expect(formatClock(3725000)).toBe("1:02:05");
  });

  it("flags moves played with under a tenth of the starting time", () => {
    expect(isTimeTrouble(17000, 180000)).toBe(true);
    expect(isTimeTrouble(18000, 180000)).toBe(false);
    expect(isTimeTrouble(undefined, 180000)).toBe(false);
    expect(isTimeTrouble(1000, null)).toBe(false);
  });
});

/** A blunder by the side to move at move `i` of the test game. */
function blunderAt(i: number): MoveAnalysis {
  const m = parsePgnMoves(PGN)[i];
  const white = m.color === PlayerColor.WHITE;
  return {
    moveNumber: m.moveNumber,
    color: m.color,
    fen: m.fen,
    fenBefore: m.fenBefore,
    sanMove: m.san,
    uciMove: m.uci,
    evalBefore: 0,
    evalAfter: white ? -500 : 500,
    evalDelta: -500,
    mateBefore: null,
    mateAfter: null,
    bestMove: null,
    bestMoveSan: null,
    bestMoveEval: 0,
    bestMoveMate: null,
    pvLines: [],
    replyLine: [],
    classification: MoveClassification.BLUNDER,
    moveAccuracy: 10,
    isCapture: m.isCapture,
    isCheck: m.isCheck,
    isCastle: m.isCastle,
    isPromotion: m.isPromotion,
    isSacrifice: false,
  };
}

describe("clock-aware coaching", () => {
  const moves = parsePgnMoves(PGN);
  const baseMs = baseTimeMs("180");

  it("mentions the clock when a bad move was played in time trouble", () => {
    const e = explainMove(blunderAt(4), { clockMs: moves[4].clockMs, baseMs });
    expect(e.clock).toBe("0:07");
    expect(e.timeTrouble).toBe(true);
    expect(e.detail).toContain("with 0:07 left");
  });

  it("shows the clock but does not blame it when there was plenty of time", () => {
    const e = explainMove(blunderAt(0), { clockMs: moves[0].clockMs, baseMs });
    expect(e.clock).toBe("2:59");
    expect(e.timeTrouble).toBe(false);
    expect(e.detail).not.toContain("left");
  });

  it("has no clock for games without one", () => {
    const e = explainMove(blunderAt(4));
    expect(e.clock).toBeNull();
    expect(e.timeTrouble).toBe(false);
  });

  it("counts costly moves made in time trouble in the game report", () => {
    // White blunders on moves 1, 2 and 3; only 2.Qh5 (0:12) and 3.Bc4 (0:07) are under 0:18.
    const analyses = [0, 1, 2, 3, 4].map((i) =>
      i % 2 === 0 ? blunderAt(i) : { ...blunderAt(i), classification: MoveClassification.BEST, evalAfter: 0, evalDelta: 0 }
    );
    const report = buildGameReport(analyses, PlayerColor.WHITE, { clocks: moves.map((m) => m.clockMs), baseMs });
    expect(report.timeTrouble).not.toBeNull();
    expect(report.timeTrouble!.rushed).toBe(2);
    expect(report.timeTrouble!.total).toBe(3);
    expect(report.timeTrouble!.moves).toEqual(["2.Qh5", "3.Bc4"]);
    expect(report.timeTrouble!.line).toBe("2 of your 3 costly mistakes came with under 0:18 on your clock (2.Qh5, 3.Bc4).");
    expect(report.focus.some((f) => f.title === "Manage your clock")).toBe(true);
  });

  it("reports no time trouble without clocks", () => {
    const report = buildGameReport([blunderAt(0), blunderAt(2)], PlayerColor.WHITE);
    expect(report.timeTrouble).toBeNull();
  });
});
