import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { State } from "ts-fsrs";
import { DB_NAME, closeDb } from "@/lib/storage/db";
import { parsePgnMoves } from "@/lib/chess/pgn-parser";
import { buildGameReport } from "@/lib/coach/report";
import {
  AnalysisStatus,
  GameResult,
  MoveClassification,
  PlayerColor,
  TimeClass,
  type EngineEvaluation,
  type GameAnalysis,
  type MoveAnalysis,
  type ParsedGame,
} from "@/types/chess";
import { CONVERT_MOVES, judgeAfterReply, judgeConversion, winAfterMove } from "./conversion";
import { acceptedAnswers, cardsFromGame, deckStats, dueCards, isCorrect, reviewCard } from "./deck";
import { loadCards, loadSummaries, loadSummary, recordGame, saveCard, saveSummary } from "./store";
import { buildProfile, openConversions, reportForGame, summarizeGame, type GameSummary } from "./summary";
import { MAX_LINE, gradeAnswer, makeExercise, plainMove, seeded } from "./visualize";

// 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4 4.Nxe5 Qg5 5.Nxf7 Qxg2 6.Rf1 Qxe4+ 7.Be2 Nf3#
const PGN = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#";
const MOVES = parsePgnMoves(PGN);

const line = (sans: string[], score: number, mate: number | null = null): EngineEvaluation => ({
  depth: 16,
  score,
  mate,
  pv: [],
  pvSan: sans,
  multipv: 1,
});

/** Analysis of move `i`. Evaluations are in centipawns from White's side. */
function analysed(
  i: number,
  facts: {
    cls?: MoveClassification;
    before?: number;
    after?: number;
    lines?: EngineEvaluation[];
    reply?: string[];
  } = {}
): MoveAnalysis {
  const m = MOVES[i];
  const lines = facts.lines ?? [];
  const before = facts.before ?? 0;
  const after = facts.after ?? before;
  const white = m.color === PlayerColor.WHITE;
  return {
    moveNumber: m.moveNumber,
    color: m.color,
    fen: m.fen,
    fenBefore: m.fenBefore,
    sanMove: m.san,
    uciMove: m.uci,
    evalBefore: before,
    evalAfter: after,
    evalDelta: white ? after - before : before - after,
    mateBefore: null,
    mateAfter: null,
    bestMove: null,
    bestMoveSan: lines[0]?.pvSan[0] ?? null,
    bestMoveEval: white ? before : -before,
    bestMoveMate: null,
    pvLines: lines,
    replyLine: facts.reply ?? [],
    classification: facts.cls ?? MoveClassification.BEST,
    moveAccuracy: 80,
    isCapture: m.isCapture,
    isCheck: m.isCheck,
    isCastle: m.isCastle,
    isPromotion: m.isPromotion,
    isSacrifice: false,
  };
}

function gameOf(id: string, playerColor = PlayerColor.WHITE): ParsedGame {
  return {
    id,
    chessComUrl: `https://www.chess.com/game/live/${id}`,
    pgn: PGN,
    moves: MOVES,
    playerColor,
    playerUsername: "Me",
    opponentUsername: "them",
    playerRating: 1200,
    opponentRating: 1250,
    timeControl: "600",
    timeClass: TimeClass.RAPID,
    result: GameResult.LOSS,
    playedAt: new Date("2026-03-01T10:00:00Z"),
    moveCount: 7,
  };
}

function analysisOf(gameId: string, moves: MoveAnalysis[]): GameAnalysis {
  return {
    gameId,
    engineDepth: 16,
    engineVersion: "test",
    moves,
    averageCpl: 40,
    accuracy: 71.2,
    openingAccuracy: null,
    middlegameAccuracy: null,
    endgameAccuracy: null,
    classificationCounts: {} as GameAnalysis["classificationCounts"],
    status: AnalysisStatus.COMPLETED,
    analyzedAt: new Date(),
  };
}

/**
 * White's game: 4.Nxe5 is a blunder (the engine wanted Nxd4, with c3 clearly
 * worse), 5.Nxf7 is a mistake where two moves are about equal, the rest is fine.
 */
function whiteGameMoves(): MoveAnalysis[] {
  return MOVES.map((_, i) => {
    if (i === 6)
      return analysed(i, {
        cls: MoveClassification.BLUNDER,
        before: 150,
        after: -200,
        lines: [line(["Nxd4", "exd4", "O-O", "d6"], 150), line(["c3", "Nxf3+"], 20)],
        reply: ["Qg5", "Nxf7", "Qxg2"],
      });
    if (i === 8)
      return analysed(i, {
        cls: MoveClassification.MISTAKE,
        before: -200,
        after: -600,
        lines: [line(["Bxf7+", "Kd8"], -200), line(["Ng4", "d5"], -215)],
        reply: ["Qxg2", "Rf1", "Qxe4+"],
      });
    return analysed(i, { before: i < 6 ? 30 : -200 });
  });
}

const DAY = 24 * 60 * 60 * 1000;

describe("mistake deck", () => {
  const game = gameOf("cc_1");
  const analysis = analysisOf("cc_1", whiteGameMoves());
  const report = reportForGame(game, analysis);
  const cards = cardsFromGame(game, analysis, report, 1_000_000);

  it("accepts only the best move when the second is clearly worse", () => {
    expect(acceptedAnswers(analysis.moves[6])).toEqual(["Nxd4"]);
  });

  it("accepts both moves when the second is about as good", () => {
    expect(acceptedAnswers(analysis.moves[8])).toEqual(["Bxf7+", "Ng4"]);
  });

  it("has no answer without an engine move", () => {
    expect(acceptedAnswers(analysis.moves[0])).toEqual([]);
  });

  it("turns costly key moments into cards", () => {
    expect(cards.map((c) => c.id)).toEqual(["cc_1:6", "cc_1:8"]);
    const first = cards[0];
    expect(first).toMatchObject({
      username: "me",
      gameId: "cc_1",
      index: 6,
      fen: MOVES[6].fenBefore,
      color: "w",
      answers: ["Nxd4"],
      played: "Nxe5",
      line: ["Nxd4", "exd4", "O-O", "d6"],
      seen: 0,
    });
    expect(first.winDrop).toBeGreaterThanOrEqual(10);
    expect(first.headline).toContain("4.Nxe5");
    expect(first.takeaway).toBeTruthy();
  });

  it("skips moments that cost less than ten points of winning chance", () => {
    const mild = whiteGameMoves();
    mild[6] = analysed(6, {
      cls: MoveClassification.MISTAKE,
      before: 150,
      after: 130,
      lines: [line(["Nxd4"], 150)],
    });
    mild[8] = analysed(8, { before: 130 });
    const a = analysisOf("cc_1", mild);
    expect(cardsFromGame(game, a, reportForGame(game, a))).toEqual([]);
  });

  it("grades answers, ignoring check marks", () => {
    expect(isCorrect(cards[1], "Bxf7")).toBe(true);
    expect(isCorrect(cards[1], "Ng4")).toBe(true);
    expect(isCorrect(cards[1], "Nxf7")).toBe(false);
  });

  it("shows new cards as due right away", () => {
    expect(dueCards(cards, 1_000_000).map((c) => c.id)).toEqual(["cc_1:6", "cc_1:8"]);
    expect(deckStats(cards, 1_000_000)).toMatchObject({ total: 2, due: 2, learned: 0, recall: null, nextDue: null });
  });

  it("pushes a correct answer further out than a wrong one", () => {
    const now = 1_000_000;
    const right = reviewCard(cards[0], true, now);
    const wrong = reviewCard(cards[0], false, now);
    const dueRight = new Date(right.fsrs.due).getTime();
    const dueWrong = new Date(wrong.fsrs.due).getTime();
    expect(dueRight).toBeGreaterThan(dueWrong);
    expect(dueWrong).toBeGreaterThan(now);
    expect(right).toMatchObject({ seen: 1, correct: 1 });
    expect(wrong).toMatchObject({ seen: 1, correct: 0 });
    expect(dueCards([right, wrong], now)).toEqual([]);
    expect(dueCards([right, wrong], dueWrong).map((c) => c.id)).toEqual([wrong.id]);
  });

  it("grows the interval with each correct review", () => {
    let card = cards[0];
    let now = 1_000_000;
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      card = reviewCard(card, true, now);
      const due = new Date(card.fsrs.due).getTime();
      gaps.push(due - now);
      now = due;
    }
    expect(card.fsrs.state).toBe(State.Review);
    expect(gaps[3]).toBeGreaterThan(gaps[2]);
    expect(gaps[3]).toBeGreaterThan(3 * DAY);
    const stats = deckStats([card], now - 1);
    expect(stats).toMatchObject({ due: 0, learned: 1, recall: 100 });
    expect(stats.nextDue).toBe(now);
  });
});

describe("game summaries and weakness profile", () => {
  const game = gameOf("cc_1");
  const analysis = analysisOf("cc_1", whiteGameMoves());
  const summary = summarizeGame(game, analysis, reportForGame(game, analysis), 5000);

  it("keeps what each skill cost in a game", () => {
    expect(summary).toMatchObject({ gameId: "cc_1", username: "me", opponent: "them", playerMoves: 7, analyzedAt: 5000 });
    expect(summary.skills.length).toBeGreaterThan(0);
    const total = summary.skills.reduce((s, k) => s + k.count, 0);
    expect(total).toBe(2);
    for (const s of summary.skills) {
      expect(s.cost).toBeGreaterThan(0);
      expect(s.examples[0].label).toMatch(/^\d+\./);
    }
  });

  it("ranks all six skills by winning chances lost per game", () => {
    const clean: GameSummary = { ...summary, gameId: "cc_2", skills: [], conversion: null };
    const profile = buildProfile([summary, clean]);
    expect(profile.games).toBe(2);
    expect(profile.skills).toHaveLength(6);
    const costs = profile.skills.map((s) => s.lostPerGame);
    expect([...costs].sort((a, b) => b - a)).toEqual(costs);

    const top = profile.skills[0];
    const fromGame = summary.skills.find((s) => s.skill === top.skill)!;
    expect(top.lostPerGame).toBeCloseTo(fromGame.cost / 2, 1);
    expect(top.games).toBe(1);
    expect(top.examples[0]).toMatchObject({ gameId: "cc_1", opponent: "them" });
    expect(profile.skills[5].lostPerGame).toBe(0);
  });

  it("handles an empty history", () => {
    const profile = buildProfile([]);
    expect(profile.games).toBe(0);
    expect(profile.skills.every((s) => s.lostPerGame === 0)).toBe(true);
  });

  it("finds a winning position that was not converted", () => {
    // White is winning at move 4 and lost by the end.
    const moves = MOVES.map((_, i) => analysed(i, { before: i === 6 ? 600 : i < 6 ? 30 : -300, after: i >= 6 ? -300 : 30 }));
    const report = buildGameReport(moves, PlayerColor.WHITE);
    expect(report.conversion).toMatchObject({ index: 6, fen: MOVES[6].fenBefore });
    expect(report.conversion!.peak).toBeGreaterThanOrEqual(85);
    expect(report.conversion!.end).toBeLessThan(60);

    const level = buildGameReport(MOVES.map((_, i) => analysed(i, { before: 30 })), PlayerColor.WHITE);
    expect(level.conversion).toBeNull();
  });

  it("lists games still waiting to be won again, newest first", () => {
    const conversion = { index: 6, fen: MOVES[6].fenBefore, peak: 90, end: 20 };
    const a: GameSummary = { ...summary, gameId: "a", playedAt: 1, conversion };
    const b: GameSummary = { ...summary, gameId: "b", playedAt: 2, conversion };
    const done: GameSummary = { ...summary, gameId: "c", playedAt: 3, conversion, convertedAt: 9 };
    const none: GameSummary = { ...summary, gameId: "d", playedAt: 4, conversion: null };
    expect(openConversions([a, b, done, none]).map((s) => s.gameId)).toEqual(["b", "a"]);
  });
});

describe("training storage", () => {
  afterEach(async () => {
    await closeDb();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });

  it("records a game once and keeps the review schedule on a second pass", async () => {
    const game = gameOf("cc_9");
    const analysis = analysisOf("cc_9", whiteGameMoves());

    const first = await recordGame(game, analysis);
    expect(first.added).toBe(2);
    expect((await loadSummaries("ME")).map((s) => s.gameId)).toEqual(["cc_9"]);
    expect(await loadSummaries("someone-else")).toEqual([]);

    const cards = await loadCards("me");
    const reviewed = reviewCard(cards[0], true, Date.now());
    await saveCard(reviewed);

    const second = await recordGame(game, analysis);
    expect(second.added).toBe(0);
    const again = await loadCards("me");
    expect(again).toHaveLength(2);
    expect(again.find((c) => c.id === reviewed.id)?.seen).toBe(1);
  });

  it("keeps a game marked as won again when it is analyzed again", async () => {
    const game = gameOf("cc_9");
    const analysis = analysisOf("cc_9", whiteGameMoves());
    const { summary } = await recordGame(game, analysis);
    await saveSummary({ ...summary, convertedAt: 123 });
    await recordGame(game, analysis);
    expect((await loadSummary("cc_9"))?.convertedAt).toBe(123);
  });
});

describe("win it again", () => {
  const start = new Chess().fen();
  const mated = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
  const stalemate = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";

  it("reads the mover's winning chances from the reply position", () => {
    // The side to move is 300 centipawns down, so the side that just moved is well ahead.
    expect(winAfterMove(start, [{ depth: 14, score: -300, mate: null, pv: [], multipv: 1 }])).toBeGreaterThan(70);
    expect(winAfterMove(start, [{ depth: 14, score: 0, mate: -2, pv: [], multipv: 1 }])).toBe(100);
    expect(winAfterMove(mated, [])).toBe(100);
    expect(winAfterMove(stalemate, [])).toBe(50);
  });

  it("keeps going while the position stays winning", () => {
    expect(judgeConversion(start, 92, 3).status).toBe("playing");
  });

  it("fails as soon as the winning chances drop below the target", () => {
    const verdict = judgeConversion(start, 64, 3);
    expect(verdict.status).toBe("failed");
    expect(verdict.reason).toContain("64%");
  });

  it("passes after ten winning moves, or on checkmate", () => {
    expect(judgeConversion(start, 85, CONVERT_MOVES).status).toBe("passed");
    expect(judgeConversion(mated, 100, 2).status).toBe("passed");
  });

  it("fails on stalemate", () => {
    expect(judgeConversion(stalemate, 50, 4).status).toBe("failed");
  });

  it("fails when the engine's reply mates or draws", () => {
    expect(judgeAfterReply(mated)?.status).toBe("failed");
    expect(judgeAfterReply(start)).toBeNull();
  });
});

describe("visualization", () => {
  const start = new Chess().fen();
  const sans = ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "d4"];

  it("needs at least four legal half-moves", () => {
    expect(makeExercise(start, ["e4", "e5", "Nf3"], 1)).toBeNull();
    expect(makeExercise(start, ["e4", "e5", "Ke3", "Nc6"], 1)).toBeNull();
  });

  it("uses at most six half-moves and formats the line", () => {
    const ex = makeExercise(start, sans, 1)!;
    expect(ex.line).toHaveLength(MAX_LINE);
    expect(ex.text).toBe("1.e2-e4 d7-d5 2.e4-d5 Qd8-d5 3.Nb1-c3 Qd5-a5");
    expect(ex.turn).toBe("w");
    expect(new Chess(ex.finalFen).get("a5")).toMatchObject({ type: "q", color: "b" });
  });

  it("never shows capture, check or mate marks in the line", () => {
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const mate = makeExercise(afterE4, ["e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"], 1)!;
    expect(mate.text).toBe("1...e7-e5 2.Qd1-h5 Nb8-c6 3.Bf1-c4 Ng8-f6 4.Qh5-f7");
    for (let seed = 0; seed < 20; seed++) {
      expect(makeExercise(start, sans, seed)!.text).not.toMatch(/[x+#]/);
    }
  });

  it("writes castling and promotion without marks", () => {
    expect(plainMove({ san: "O-O+", piece: "k", from: "e1", to: "g1" })).toBe("O-O");
    expect(plainMove({ san: "bxa8=Q+", piece: "p", from: "b7", to: "a8", promotion: "q" })).toBe("b7-a8=Q");
    expect(plainMove({ san: "Nxe5", piece: "n", from: "f3", to: "e5" })).toBe("Nf3-e5");
  });

  it("asks whether the piece that moved last is defended", () => {
    // 3...Qa5: the queen on a5 has no defender. 3.Nc3: the knight is defended by the b- and d-pawns.
    const queen = makeExercise(start, sans, 1, "defended")!.question;
    expect(queen.prompt).toBe("At the end, is the black queen on a5 defended by another Black piece?");
    expect(queen.answer).toBe("No");
    const knight = makeExercise(start, sans.slice(0, 5), 1, "defended")!.question;
    expect(knight.prompt).toContain("white knight on c3");
    expect(knight.answer).toBe("Yes");
    expect(knight.explain).toBe("It is defended 2 times.");
  });

  it("is reproducible from its seed", () => {
    expect(makeExercise(start, sans, 42)).toEqual(makeExercise(start, sans, 42));
    const rand = seeded(7);
    const again = seeded(7);
    expect([rand(), rand(), rand()]).toEqual([again(), again(), again()]);
  });

  it("counts captures", () => {
    const q = makeExercise(start, sans, 1, "captures")!.question;
    expect(q.answer).toBe("2");
    expect(q.options).toContain(q.answer);
    expect(gradeAnswer(q, "2")).toBe(true);
    expect(gradeAnswer(q, "1")).toBe(false);
  });

  it("asks about check at the end of the line", () => {
    expect(makeExercise(start, sans, 1, "check")!.question.answer).toBe("No");
    const scholars = makeExercise(start, ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"].slice(1), 1, "check");
    expect(scholars).toBeNull(); // not legal from the start position without 1.e4
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const mate = makeExercise(afterE4, ["e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"], 1, "check")!;
    expect(mate.question.answer).toBe("Yes");
    expect(mate.question.explain).toContain("checkmate");
  });

  it("works out who wins material", () => {
    // 1.e4 d5 2.exd5 Qxd5 is an even trade.
    expect(makeExercise(start, ["e4", "d5", "exd5", "Qxd5"], 1, "material")!.question.answer).toBe("Neither");
    // 1.e4 d5 2.exd5 Nf6 3.c4 e6: White is a pawn up.
    const up = makeExercise(start, ["e4", "d5", "exd5", "Nf6", "c4", "e6"], 1, "material")!.question;
    expect(up.answer).toBe("White");
    expect(up.explain).toContain("1 point ahead");
  });

  it("asks what is on a square the line touched, with the right answer among four options", () => {
    for (let seed = 0; seed < 25; seed++) {
      const ex = makeExercise(start, sans, seed, "square")!;
      const q = ex.question;
      const square = q.prompt.match(/on ([a-h][1-8])/)![1];
      const piece = new Chess(ex.finalFen).get(square as Parameters<Chess["get"]>[0]);
      const expected = piece ? `${piece.color === "w" ? "White" : "Black"} ${{ p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }[piece.type]}` : "Empty";
      expect(q.answer).toBe(expected);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.answer);
    }
  });
});
