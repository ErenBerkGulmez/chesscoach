import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nameOpening, openingFamily, parseOpeningBook, positionKey, sideChoices } from "./opening-book";
import { classifyGameOpening, computeOpeningCategoryStats } from "./opening-classifier";
import { buildOpeningTree, mainLine } from "./opening-tree";
import { parsePgnMoves } from "./pgn-parser";
import { GameResult, OpeningCategoryKey, PlayerColor, TimeClass, type ParsedGame } from "@/types/chess";

const book = parseOpeningBook(readFileSync(join(process.cwd(), "public/openings/book.tsv"), "utf8"));

let nextId = 0;
function game(pgn: string, playerColor: PlayerColor, result: GameResult, openingName = "From Chess.com"): ParsedGame {
  const moves = parsePgnMoves(pgn);
  nextId++;
  return {
    id: `g${nextId}`,
    chessComUrl: `https://www.chess.com/game/live/${nextId}`,
    pgn,
    moves,
    playerColor,
    playerUsername: "me",
    opponentUsername: "them",
    playerRating: 1200,
    opponentRating: 1200,
    timeControl: "600",
    timeClass: TimeClass.RAPID,
    result,
    openingName,
    eco: "X00",
    playedAt: new Date("2026-01-01T00:00:00Z"),
    moveCount: Math.ceil(moves.length / 2),
  };
}

const NAJDORF = "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5";
const ALAPIN = "1. e4 c5 2. c3 Nf6 3. e5 Nd5";
const ITALIAN = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6";
const QGD = "1. d4 d5 2. c4 e6 3. Nc3 Nf6";

describe("opening book", () => {
  it("has a few thousand named positions", () => {
    expect(book.size).toBeGreaterThan(3000);
  });

  it("names a position from its FEN", () => {
    const afterC5 = parsePgnMoves("1. e4 c5")[1].fen;
    expect(book.get(positionKey(afterC5))).toEqual({ eco: "B20", name: "Sicilian Defense" });
  });

  it("walks to the last named position of a game", () => {
    const named = nameOpening(parsePgnMoves(NAJDORF), book);
    expect(named?.name).toContain("Sicilian Defense: Najdorf Variation");
    expect(named?.eco.startsWith("B9")).toBe(true);
  });

  it("gives the same name to a transposition", () => {
    const direct = nameOpening(parsePgnMoves("1. d4 Nf6 2. c4 e6 3. Nc3 Bb4"), book);
    const transposed = nameOpening(parsePgnMoves("1. c4 e6 2. Nc3 Nf6 3. d4 Bb4"), book);
    expect(direct?.name).toBe("Nimzo-Indian Defense");
    expect(transposed?.name).toBe(direct?.name);
  });

  it("returns null when nothing is named", () => {
    expect(nameOpening([], book)).toBeNull();
  });

  it("separates what each side chose", () => {
    const { white, black } = sideChoices(parsePgnMoves(ALAPIN), book);
    expect(white?.name).toContain("Alapin");
    expect(openingFamily(black!.name)).toBe("Sicilian Defense");
  });

  it("takes the family from the part before the colon", () => {
    expect(openingFamily("Sicilian Defense: Najdorf Variation, English Attack")).toBe("Sicilian Defense");
    expect(openingFamily("Italian Game")).toBe("Italian Game");
  });
});

describe("classifyGameOpening", () => {
  it("uses the book when it is loaded", () => {
    const c = classifyGameOpening(game(ITALIAN, PlayerColor.WHITE, GameResult.WIN), book);
    expect(c.whiteChoice.family).toBe("Italian Game");
    expect(c.blackChoice.detailed).toContain("Italian Game");
    expect(c.whiteChoice.eco.startsWith("C5")).toBe(true);
  });

  it("falls back to the Chess.com name without the book", () => {
    const c = classifyGameOpening(game(ITALIAN, PlayerColor.WHITE, GameResult.WIN, "Giuoco Piano Game: Main Line"));
    expect(c.whiteChoice).toEqual({ family: "Giuoco Piano Game", detailed: "Giuoco Piano Game: Main Line", eco: "X00" });
    expect(c.blackChoice).toEqual(c.whiteChoice);
  });

  it("groups games by the opening the player chose", () => {
    const games = [
      game(NAJDORF, PlayerColor.BLACK, GameResult.WIN),
      game(ALAPIN, PlayerColor.BLACK, GameResult.LOSS),
      game(QGD, PlayerColor.BLACK, GameResult.DRAW),
      game(ITALIAN, PlayerColor.WHITE, GameResult.WIN),
    ];
    const result = computeOpeningCategoryStats(games, { category: OpeningCategoryKey.BLACK_PLAYER_DEFENSES, book });
    expect(result.totalGames).toBe(3);
    const sicilian = result.stats.find((s) => s.name === "Sicilian Defense");
    expect(sicilian?.games).toBe(2);
    expect(sicilian?.wins).toBe(1);
    expect(result.stats.some((s) => s.name === "Queen's Gambit Declined")).toBe(true);
  });
});

describe("opening tree", () => {
  const games = [
    game(NAJDORF, PlayerColor.WHITE, GameResult.WIN),
    game(ALAPIN, PlayerColor.WHITE, GameResult.DRAW),
    game(ITALIAN, PlayerColor.WHITE, GameResult.LOSS),
    game(QGD, PlayerColor.WHITE, GameResult.WIN),
    game(ITALIAN, PlayerColor.BLACK, GameResult.WIN),
  ];

  it("counts games and results along each line for one colour", () => {
    const tree = buildOpeningTree(games, PlayerColor.WHITE, book);
    expect(tree.games).toBe(4);
    expect(tree.children.map((n) => [n.label, n.games])).toEqual([
      ["1.e4", 3],
      ["1.d4", 1],
    ]);

    const e4 = tree.children[0];
    expect(e4).toMatchObject({ wins: 1, draws: 1, losses: 1, score: 50, name: "King's Pawn Game" });
    expect(e4.children.map((n) => [n.label, n.games, n.name])).toEqual([
      ["1...c5", 2, "Sicilian Defense"],
      ["1...e5", 1, "King's Pawn Game"],
    ]);

    const c5 = e4.children[0];
    expect(c5.score).toBe(75);
    expect(c5.children.map((n) => n.label).sort()).toEqual(["2.Nf3", "2.c3"]);
    expect(c5.gameIds).toHaveLength(2);
  });

  it("stops at the depth limit", () => {
    const tree = buildOpeningTree(games, PlayerColor.WHITE, book, { maxPly: 2 });
    expect(tree.children[0].children[0].children).toEqual([]);
  });

  it("averages the evaluation after move 10 from the player's side", () => {
    const [najdorf, alapin, , , italianAsBlack] = games;
    const evals = new Map([
      [najdorf.id, 1.0],
      [alapin.id, 0.4],
      [italianAsBlack.id, 0.8],
    ]);
    const white = buildOpeningTree(games, PlayerColor.WHITE, book, { evals });
    expect(white.reviewed).toBe(2);
    expect(white.children[0].evalAtTen).toBe(0.7);
    expect(white.children[0].evalGames).toBe(2);
    expect(white.children[1].evalAtTen).toBeNull();

    // As Black, an evaluation that favours White counts against the player.
    const black = buildOpeningTree(games, PlayerColor.BLACK, book, { evals });
    expect(black.children[0].evalAtTen).toBe(-0.8);
  });

  it("works without the book, just without names", () => {
    const tree = buildOpeningTree(games, PlayerColor.WHITE, null);
    expect(tree.children[0].name).toBeNull();
    expect(tree.children[0].games).toBe(3);
  });

  it("finds the most-played line", () => {
    const tree = buildOpeningTree(games, PlayerColor.WHITE, book);
    expect(mainLine(tree, 2)).toEqual(["e4", "e4 c5"]);
  });
});
