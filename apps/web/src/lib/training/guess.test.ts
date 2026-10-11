import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { MASTER_GAMES, gameScore, guessPoints, guessVerdict } from "./guess";

describe("bundled master games", () => {
  it.each(MASTER_GAMES.map((g) => [g.id, g] as const))("%s is a legal game from before 1950", (_id, g) => {
    const chess = new Chess();
    chess.loadPgn(g.moves);
    const plies = chess.history().length;
    expect(plies).toBeGreaterThan(15);
    expect(g.year).toBeLessThan(1950);
    // There is at least one move to guess after the opening moves that are played out.
    expect((g.startMove - 1) * 2).toBeLessThan(plies - 1);
  });

  it("ends the mating games in checkmate by the side being guessed", () => {
    for (const g of MASTER_GAMES.filter((m) => m.moves.endsWith("#"))) {
      const chess = new Chess();
      chess.loadPgn(g.moves);
      expect(chess.isCheckmate()).toBe(true);
      expect(chess.turn()).not.toBe(g.side);
    }
  });

  it("has unique ids", () => {
    expect(new Set(MASTER_GAMES.map((g) => g.id)).size).toBe(MASTER_GAMES.length);
  });
});

describe("guess scoring", () => {
  it("gives full points for the master's move", () => {
    expect(guessPoints(60, 10, true)).toBe(100);
  });

  it("gives full points for a move that is as good or better", () => {
    expect(guessPoints(70, 70, false)).toBe(100);
    expect(guessPoints(70, 85, false)).toBe(100);
  });

  it("takes four points per point of winning chance given up", () => {
    expect(guessPoints(80, 75, false)).toBe(80);
    expect(guessPoints(80, 60, false)).toBe(20);
    expect(guessPoints(80, 40, false)).toBe(0);
  });

  it("averages the points into a game score", () => {
    expect(gameScore([100, 80, 0])).toBe(60);
    expect(gameScore([])).toBe(0);
  });

  it("words the verdict by how close the guess was", () => {
    expect(guessVerdict(100, true)).toContain("master's move");
    expect(guessVerdict(100, false)).toContain("Just as good");
    expect(guessVerdict(80, false)).toContain("good move");
    expect(guessVerdict(40, false)).toContain("weaker");
    expect(guessVerdict(0, false)).toContain("loses");
  });
});
