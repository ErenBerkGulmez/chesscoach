import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  MAIA_MOVES,
  MAIA_RATINGS,
  chooseMove,
  encodeBoard,
  mirrorFen,
  mirrorMove,
  nearestBotRating,
  prepareInput,
  rankMoves,
  ratingBucket,
} from "./maia";
import { seeded } from "./visualize";

const START = new Chess().fen();
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

/** The value of one plane at a square, e.g. plane 0 (white pawns) at "e2". */
function at(board: Float32Array, plane: number, square: string) {
  return board[plane * 64 + (Number(square[1]) - 1) * 8 + "abcdefgh".indexOf(square[0])];
}
const planeSum = (board: Float32Array, plane: number) => board.slice(plane * 64, plane * 64 + 64).reduce((a, b) => a + b, 0);

describe("move list", () => {
  it("has the 1880 moves the model outputs, without repeats", () => {
    expect(MAIA_MOVES).toHaveLength(1880);
    expect(new Set(MAIA_MOVES).size).toBe(1880);
  });

  it("lists a square's queen moves from the highest square down, then its knight moves", () => {
    // a1: queen targets a8, h8 (via the diagonal), ... then knight targets b3, c2.
    expect(MAIA_MOVES.slice(0, 4)).toEqual(["a1h8", "a1a8", "a1g7", "a1a7"]);
    expect(MAIA_MOVES.slice(21, 23)).toEqual(["a1b3", "a1c2"]);
    expect(MAIA_MOVES[23].startsWith("b1")).toBe(true);
  });

  it("ends with promotions for White, straight then captures", () => {
    expect(MAIA_MOVES.slice(1792, 1800)).toEqual(["a7a8q", "a7a8r", "a7a8b", "a7a8n", "a7b8q", "a7b8r", "a7b8b", "a7b8n"]);
    expect(MAIA_MOVES[1879]).toBe("h7g8n");
    expect(MAIA_MOVES.filter((m) => m.length === 5)).toHaveLength(88);
  });

  it("covers every legal move of a normal game, castling included", () => {
    const chess = new Chess();
    chess.loadPgn("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d4 exd4 6. e5 d5 7. exf6 dxc4");
    expect(MAIA_MOVES).toContain("e1g1");
    const input = prepareInput(chess.fen(), 1500, 1500)!;
    expect(input.legal).toHaveLength(chess.moves().length);
  });
});

describe("rating buckets", () => {
  it("match the model: one below 1100, one per hundred, one from 2000 up", () => {
    expect([ratingBucket(800), ratingBucket(1099), ratingBucket(1100), ratingBucket(1199), ratingBucket(1550), ratingBucket(1999), ratingBucket(2000), ratingBucket(2600)]).toEqual([0, 0, 1, 1, 5, 9, 10, 10]);
  });

  it("offers bot ratings from 1000 to 2000 and snaps a player's rating to one", () => {
    expect(MAIA_RATINGS[0]).toBe(1000);
    expect(MAIA_RATINGS[MAIA_RATINGS.length - 1]).toBe(2000);
    expect(nearestBotRating(1234)).toBe(1200);
    expect(nearestBotRating(1250)).toBe(1300);
    expect(nearestBotRating(600)).toBe(1000);
    expect(nearestBotRating(2500)).toBe(2000);
  });
});

describe("mirroring", () => {
  it("flips the board, the colours, castling rights and the en passant square", () => {
    expect(mirrorFen(AFTER_E4)).toBe("rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(mirrorFen("r3k2r/8/8/3pP3/8/8/8/R3K3 w Qkq d6 0 1")).toBe("r3k3/8/8/8/3Pp3/8/8/R3K2R b KQq d3 0 1");
    expect(mirrorFen(mirrorFen(AFTER_E4))).toBe(AFTER_E4);
  });

  it("flips moves", () => {
    expect(mirrorMove("e7e5")).toBe("e2e4");
    expect(mirrorMove("g8f6")).toBe("g1f3");
    expect(mirrorMove("b2a1q")).toBe("b7a8q");
  });
});

describe("board encoding", () => {
  it("puts each piece on its own plane, with rank 1 first", () => {
    const board = encodeBoard(START);
    expect(board).toHaveLength(18 * 64);
    expect(at(board, 0, "e2")).toBe(1); // white pawn
    expect(at(board, 1, "g1")).toBe(1); // white knight
    expect(at(board, 5, "e1")).toBe(1); // white king
    expect(at(board, 6, "e7")).toBe(1); // black pawn
    expect(at(board, 10, "d8")).toBe(1); // black queen
    expect(at(board, 0, "e7")).toBe(0);
    expect([0, 1, 2, 3, 4, 5].map((p) => planeSum(board, p))).toEqual([8, 2, 2, 2, 1, 1]);
    expect([6, 7, 8, 9, 10, 11].map((p) => planeSum(board, p))).toEqual([8, 2, 2, 2, 1, 1]);
  });

  it("marks the side to move, castling rights and en passant", () => {
    const board = encodeBoard(START);
    expect([12, 13, 14, 15, 16, 17].map((p) => planeSum(board, p))).toEqual([64, 64, 64, 64, 64, 0]);

    const some = encodeBoard("r3k2r/8/8/3pP3/8/8/8/R3K3 w Qk d6 0 1");
    expect([13, 14, 15, 16].map((p) => planeSum(some, p))).toEqual([0, 64, 64, 0]);
    expect(planeSum(some, 17)).toBe(1);
    expect(at(some, 17, "d6")).toBe(1);
    expect(planeSum(encodeBoard(AFTER_E4), 12)).toBe(0);
  });
});

describe("preparing a position", () => {
  it("keeps the board as it is for White", () => {
    const input = prepareInput(START, 1500, 1350)!;
    expect(input.ratingSelf).toBe(5);
    expect(input.ratingOpponent).toBe(3);
    expect(input.legal).toHaveLength(20);
    expect(input.legal.map((l) => l.uci)).toContain("e2e4");
    expect(planeSum(input.board, 12)).toBe(64);
  });

  it("mirrors the board for Black and gives the moves back as Black plays them", () => {
    const input = prepareInput(AFTER_E4, 1500, 1500)!;
    // The model sees White to move, with Black's pieces as its own.
    expect(planeSum(input.board, 12)).toBe(64);
    expect(at(input.board, 6, "e5")).toBe(1); // the pawn White pushed, now an enemy pawn on the mirrored board
    const ucis = input.legal.map((l) => l.uci);
    expect(ucis).toContain("e7e5");
    expect(ucis).toContain("g8f6");
    expect(ucis).not.toContain("e2e4");
    // e7e5 for Black is the model's e2e4.
    expect(input.legal.find((l) => l.uci === "e7e5")!.index).toBe(MAIA_MOVES.indexOf("e2e4"));
  });

  it("returns null when there is no legal move", () => {
    expect(prepareInput("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", 1500, 1500)).toBeNull();
  });
});

describe("choosing a move", () => {
  const legal = [
    { uci: "e2e4", index: 0 },
    { uci: "d2d4", index: 1 },
    { uci: "a2a3", index: 2 },
  ];

  it("turns the output into probabilities over the legal moves only", () => {
    const ranked = rankMoves([2, 1, -5, 99], legal);
    expect(ranked.map((m) => m.uci)).toEqual(["e2e4", "d2d4", "a2a3"]);
    expect(ranked.reduce((s, m) => s + m.probability, 0)).toBeCloseTo(1);
    expect(ranked[0].probability).toBeCloseTo(0.7306, 3);
  });

  it("samples likely moves and never a move a human would almost never play", () => {
    const ranked = rankMoves([2, 1, -5], legal);
    const rand = seeded(11);
    const picks = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      const uci = chooseMove(ranked, rand).uci;
      picks.set(uci, (picks.get(uci) ?? 0) + 1);
    }
    expect(picks.get("a2a3")).toBeUndefined();
    expect(picks.get("e2e4")!).toBeGreaterThan(picks.get("d2d4")!);
    expect(picks.get("d2d4")!).toBeGreaterThan(50);
  });
});

/**
 * Runs the real network when it has been installed with `npm run setup:maia`.
 * It is skipped otherwise (the 93 MB model is not in the repository).
 */
const MODEL = join(process.cwd(), "public/maia/maia_rapid.onnx");

describe.skipIf(!existsSync(MODEL))("with the model installed", () => {
  it("finds obvious moves for both sides, and plays differently at different ratings", async () => {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(readFileSync(MODEL));
    expect(session.inputNames).toEqual(["boards", "elo_self", "elo_oppo"]);

    const top = async (fen: string, rating: number) => {
      const input = prepareInput(fen, rating, rating)!;
      const out = await session.run({
        boards: new ort.Tensor("float32", input.board, [1, 18, 8, 8]),
        elo_self: new ort.Tensor("int64", BigInt64Array.from([BigInt(input.ratingSelf)]), [1]),
        elo_oppo: new ort.Tensor("int64", BigInt64Array.from([BigInt(input.ratingOpponent)]), [1]),
      });
      return rankMoves(out[session.outputNames[0]].data as Float32Array, input.legal);
    };

    // The network was trained on positions after the opening, so it is checked on those.
    // White to move can take on f7 with mate.
    const mate = await top("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", 1500);
    expect(mate[0].uci).toBe("h5f7");
    expect(mate[0].probability).toBeGreaterThan(0.6);

    // The same position mirrored, so that Black has the mate: the answer must mirror too.
    const mirrored = await top("rnb1k1nr/pppp1ppp/8/2b1p3/4P2q/2N2N2/PPPP1PPP/R1BQKB1R b KQkq - 4 4", 1500);
    expect(mirrored[0].uci).toBe("h4f2");

    // Scholar's mate threat: stronger players defend f7 more reliably.
    const threat = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
    const defends = (moves: Awaited<ReturnType<typeof top>>) =>
      moves.filter((m) => ["g7g6", "d8e7", "d8f6"].includes(m.uci)).reduce((s, m) => s + m.probability, 0);
    const weak = defends(await top(threat, 1000));
    const strong = defends(await top(threat, 1900));
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(0.8);
  }, 60_000);
});
