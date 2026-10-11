import "fake-indexeddb/auto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { createEmptyCard } from "ts-fsrs";
import { DB_NAME, closeDb } from "@/lib/storage/db";
import { GameResult, PlayerColor, TimeClass } from "@/types/chess";
import type { DeckCard } from "./deck";
import { CLASSIC_ENDGAMES, classicsFor, flipOutcome, judgeEndgameMove, outcomeOf, taskText } from "./endgame";
import { DAILY_SECONDS, cardSeconds, missingCards, openingCards, secondsLeft } from "./opening-drill";
import { cardToPgn, deckToPgn, exportFileName } from "./pgn-export";
import {
  addPractice,
  dateKey,
  loadPracticeDay,
  loadPracticeLog,
  logPractice,
  mainTimeClass,
  phaseAccuracy,
  practiceTotals,
  weekCard,
  weekStart,
  weeklyTrend,
  type PracticeDay,
} from "./progress";
import {
  PUZZLE_SKILLS,
  START_RATING,
  applyUci,
  expectedScore,
  focusSkill,
  isSolutionMove,
  loadStats,
  newStat,
  parseShard,
  pickPuzzle,
  saveStat,
  startPuzzle,
  themeName,
  updateStat,
} from "./puzzles";
import type { GameSummary, OpeningMove } from "./summary";
import { findThreats, gradeThreats } from "./threats";
import { seeded } from "./visualize";

const START = new Chess().fen();

function summary(over: Partial<GameSummary> = {}): GameSummary {
  return {
    v: 2,
    gameId: "g1",
    username: "me",
    playedAt: new Date(2026, 2, 4, 12).getTime(),
    analyzedAt: 0,
    playerColor: PlayerColor.WHITE,
    result: GameResult.WIN,
    opponent: "them",
    playerMoves: 40,
    accuracy: 80,
    skills: [],
    conversion: null,
    playerRating: 1200,
    timeClass: TimeClass.RAPID,
    blunders: 2,
    mistakes: 1,
    lostTotal: 60,
    phaseAccuracy: { opening: 90, middlegame: 70, endgame: null },
    endgame: null,
    openingMoves: [],
    ...over,
  };
}

function card(over: Partial<DeckCard> = {}): DeckCard {
  return {
    id: "g1:6",
    kind: "mistake",
    username: "me",
    gameId: "g1",
    index: 6,
    opponent: "them",
    fen: "r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    color: "w",
    answers: ["Nxd4"],
    line: ["Nxd4", "exd4", "O-O"],
    played: "Nxe5",
    headline: '4.Nxe5 walks into a "fork"',
    detail: "Black answers {Qg5} and wins material.",
    why: "it takes the knight",
    takeaway: "Count attackers.",
    skill: "opponent-threats",
    winDrop: 30,
    createdAt: new Date(2026, 2, 4).getTime(),
    seen: 0,
    correct: 0,
    fsrs: createEmptyCard(new Date(2026, 2, 4)),
    ...over,
  };
}

describe("puzzles", () => {
  // Lichess format: the first move is the opponent's. Here Black plays ...Nge7 and White mates on f7.
  const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
  const shard = [`${fen}|g8e7 f3f7|900|mateIn1`, `${START}|e2e4 e7e5 g1f3 b8c6|1500|fork`, "", "broken"].join("\n");

  it("parses a shard and skips bad lines", () => {
    const puzzles = parseShard("own-tactics", shard);
    expect(puzzles).toHaveLength(2);
    expect(puzzles[0]).toMatchObject({ id: "own-tactics:0", skill: "own-tactics", rating: 900, theme: "mateIn1", moves: ["g8e7", "f3f7"] });
    expect(themeName("mateIn1")).toBe("mate in 1");
    expect(themeName("somethingNew")).toBe("somethingNew");
  });

  it("starts with the opponent's move played", () => {
    const start = startPuzzle({ fen, moves: ["g8e7", "f3f7"] })!;
    expect(start.solver).toBe("w");
    expect(start.lastMove).toEqual(["g8", "e7"]);
    expect(start.solution).toEqual(["f3f7"]);
    expect(new Chess(start.fen).get("e7")).toMatchObject({ type: "n", color: "b" });
    expect(startPuzzle({ fen, moves: ["a1a8"] })).toBeNull();
  });

  it("accepts the listed move and any other checkmate", () => {
    const start = startPuzzle({ fen, moves: ["g8e7", "f3f7"] })!;
    expect(isSolutionMove(start.fen, "f3", "f7", "f3f7")).toBe(true);
    expect(isSolutionMove(start.fen, "c4", "b5", "f3f7")).toBe(false);
    expect(isSolutionMove(start.fen, "a2", "a3", "f3f7")).toBe(false);
    // A different mate than the listed one still counts.
    const twoMates = "6k1/5ppp/8/8/8/8/8/R3R1K1 w - - 0 1";
    expect(isSolutionMove(twoMates, "e1", "e8", "a1a8")).toBe(true);
  });

  it("applies a UCI move", () => {
    expect(applyUci(START, "e2e4")).toMatchObject({ from: "e2", to: "e4", san: "e4" });
    expect(applyUci(START, "e2e5")).toBeNull();
  });

  it("rates like Elo: more for beating a harder puzzle", () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
    expect(expectedScore(1600, 1200)).toBeGreaterThan(0.9);
    const stat = { ...newStat("Me", "endgame"), played: 20 };
    expect(stat.username).toBe("me");
    const easyWin = updateStat(stat, 800, true).rating - stat.rating;
    const hardWin = updateStat(stat, 1600, true).rating - stat.rating;
    const evenLoss = updateStat(stat, 1200, false).rating - stat.rating;
    expect(hardWin).toBeGreaterThan(easyWin);
    expect(evenLoss).toBe(-12);
    expect(updateStat(stat, 1200, true)).toMatchObject({ played: 21, solved: 1, rating: 1212 });
  });

  it("moves the rating faster for the first ten puzzles", () => {
    expect(updateStat(newStat("me", "plans"), START_RATING, true).rating).toBe(START_RATING + 24);
  });

  it("serves unseen puzzles near the player's rating", () => {
    const puzzles = Array.from({ length: 200 }, (_, i) => ({
      id: `plans:${i}`,
      skill: "plans" as const,
      fen: START,
      moves: ["e2e4", "e7e5"],
      rating: 600 + i * 9,
      theme: "quietMove",
    }));
    const rand = seeded(3);
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const p = pickPuzzle(puzzles, 1500, seen, rand)!;
      expect(Math.abs(p.rating - 1500)).toBeLessThanOrEqual(300);
      expect(seen.has(p.id)).toBe(false);
      seen.add(p.id);
    }
    expect(pickPuzzle(puzzles, 1500, new Set(puzzles.map((p) => p.id)), rand)).toBeNull();
    // With few left, it widens the window instead of giving up.
    const onlyFar = new Set(puzzles.filter((p) => p.rating > 700).map((p) => p.id));
    expect(pickPuzzle(puzzles, 2300, onlyFar, rand)!.rating).toBeLessThanOrEqual(700);
  });

  it("focuses on the costliest skill, or mixes when nothing costs anything", () => {
    expect(focusSkill({ skills: [{ skill: "endgame", lostPerGame: 4.2 }, { skill: "plans", lostPerGame: 1 }] })).toBe("endgame");
    expect(focusSkill({ skills: [{ skill: "endgame", lostPerGame: 0 }] })).toBeNull();
    expect(focusSkill({ skills: [] })).toBeNull();
  });
});

describe("shipped puzzle shards", () => {
  const dir = join(process.cwd(), "public/puzzles");
  const shards = PUZZLE_SKILLS.map((skill) => {
    const file = join(dir, `${skill}.txt.gz`);
    return { skill, bytes: statSync(file).size, puzzles: parseShard(skill, gunzipSync(readFileSync(file)).toString("utf8")) };
  });

  it("has about 30,000 puzzles in 2 MB or less", () => {
    const total = shards.reduce((s, x) => s + x.puzzles.length, 0);
    const bytes = shards.reduce((s, x) => s + x.bytes, 0);
    expect(total).toBeGreaterThan(25_000);
    expect(total).toBeLessThan(35_000);
    expect(bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it("covers ratings from 600 to 2400 in every skill, sorted by rating", () => {
    for (const { puzzles } of shards) {
      expect(puzzles.length).toBeGreaterThan(3000);
      expect(puzzles[0].rating).toBeLessThan(700);
      expect(puzzles[puzzles.length - 1].rating).toBeGreaterThan(2300);
      for (let i = 1; i < puzzles.length; i += 97) expect(puzzles[i].rating).toBeGreaterThanOrEqual(puzzles[i - 1].rating);
    }
  });

  it("has solutions that play out legally", () => {
    for (const { puzzles } of shards) {
      for (let i = 0; i < puzzles.length; i += 211) {
        const puzzle = puzzles[i];
        const start = startPuzzle(puzzle)!;
        expect(start).not.toBeNull();
        let fen = start.fen;
        for (const uci of start.solution) {
          const next = applyUci(fen, uci);
          expect(next, `${puzzle.id} ${uci}`).not.toBeNull();
          fen = next!.fen;
        }
        expect(themeName(puzzle.theme)).not.toBe("");
      }
    }
  });
});

describe("threat spotter", () => {
  it("finds an undefended piece that is attacked", () => {
    // White's knight on e5 is attacked by the queen on e7 and has no defender.
    const set = findThreats("rnb1kbnr/ppppqppp/8/4N3/8/8/PPPP1PPP/RNBQKB1R w KQkq - 0 1");
    expect(set.side).toBe("w");
    const knight = set.threats.find((t) => t.square === "e5");
    expect(knight?.kind).toBe("hanging");
    expect(knight?.note).toContain("no defender");
  });

  it("finds a piece attacked by something cheaper, even when defended", () => {
    // The black pawn on d5 attacks the white bishop on c4, which the b3 pawn defends.
    const set = findThreats("rnbqkbnr/ppp1pppp/8/3p4/2B1P3/1P6/P1PP1PPP/RNBQK1NR w KQkq - 0 1");
    expect(set.threats.find((t) => t.square === "c4")?.kind).toBe("cheaper-attacker");
  });

  it("finds enemy pieces that can give check next move", () => {
    // Black's queen on h4 can take on f2 with check.
    const set = findThreats("rnb1k1nr/pppp1ppp/8/4p3/1b2P2q/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 1");
    const checkers = set.threats.filter((t) => t.kind === "checker").map((t) => t.square).sort();
    expect(checkers).toContain("h4");
    expect(set.threats.find((t) => t.square === "h4")?.note).toMatch(/can give check/);
  });

  it("finds both pieces of a knight fork", () => {
    // The black knight on c2 forks the king on e1 and the rook on a1.
    const set = findThreats("4k3/8/8/8/8/8/2n5/R3K3 w - - 0 1");
    expect(set.threats.some((t) => t.square === "a1")).toBe(true);
  });

  it("finds nothing in the starting position", () => {
    expect(findThreats(START).threats).toEqual([]);
  });

  it("grades what was tapped", () => {
    const set = findThreats("rnb1kbnr/ppppqppp/8/4N3/8/8/PPPP1PPP/RNBQKB1R w KQkq - 0 1");
    const all = set.threats.map((t) => t.square);
    expect(gradeThreats(set, all).perfect).toBe(true);
    const partial = gradeThreats(set, ["a1"]);
    expect(partial.perfect).toBe(false);
    expect(partial.wrong).toEqual(["a1"]);
    expect(partial.missed).toEqual(all);
    expect(gradeThreats(set, [...all, "h1"]).wrong).toEqual(["h1"]);
  });
});

describe("endgame trainer", () => {
  it("has legal classic positions the tablebase covers, with the kings on the board", () => {
    for (const c of CLASSIC_ENDGAMES) {
      const chess = new Chess(c.fen);
      const pieces = chess.board().flat().filter(Boolean).length;
      expect(pieces).toBeGreaterThanOrEqual(3);
      expect(pieces).toBeLessThanOrEqual(7);
      expect(chess.isGameOver()).toBe(false);
      expect(chess.moves().length).toBeGreaterThan(0);
    }
    expect(new Set(CLASSIC_ENDGAMES.map((c) => c.id)).size).toBe(CLASSIC_ENDGAMES.length);
  });

  it("orders the classics by the player's level", () => {
    expect(classicsFor(700).slice(0, 2).map((c) => c.id)).toEqual(["kq-k", "kr-k"]);
    expect(classicsFor(700)).toHaveLength(CLASSIC_ENDGAMES.length);
    expect(classicsFor(2000)[0].id).toBe("kq-k");
  });

  it("simplifies tablebase categories", () => {
    expect(outcomeOf("win")).toBe("win");
    expect(outcomeOf("cursed-win")).toBe("win");
    expect(outcomeOf("blessed-loss")).toBe("loss");
    expect(outcomeOf("draw")).toBe("draw");
    expect(outcomeOf("unknown")).toBeNull();
    expect(flipOutcome("win")).toBe("loss");
    expect(flipOutcome("draw")).toBe("draw");
  });

  it("says when a move changes the result", () => {
    expect(judgeEndgameMove("Kd3", "win", "win")).toEqual({ ok: true, text: "Kd3 keeps the win." });
    expect(judgeEndgameMove("Kd2", "win", "draw")).toEqual({ ok: false, text: "Kd2 turns a win into a draw." });
    expect(judgeEndgameMove("Ra1", "draw", "loss")).toEqual({ ok: false, text: "Ra1 turns a draw into a loss." });
    expect(judgeEndgameMove("Ke7", "draw", "draw").text).toBe("Ke7 holds the draw.");
    expect(judgeEndgameMove("Kf8", "loss", "loss").ok).toBe(true);
  });

  it("words the task from the starting result", () => {
    expect(taskText("win")).toContain("win");
    expect(taskText("draw")).toContain("Hold");
    expect(taskText("loss")).toContain("Defend");
  });
});

describe("opening drill", () => {
  const move = (over: Partial<OpeningMove>): OpeningMove => ({
    key: "pos-a",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    ply: 2,
    played: "Qh5",
    best: "Nf3",
    loss: 90,
    line: ["Nf3", "Nc6", "Bb5"],
    ...over,
  });

  it("makes a card for a position reached twice with a costly move", () => {
    const cards = openingCards(
      [
        summary({ gameId: "old", playedAt: 1000, openingMoves: [move({ played: "Nf3", loss: 0 })] }),
        summary({ gameId: "new", playedAt: 2000, opponent: "rival", openingMoves: [move({})] }),
      ],
      5000
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "opening:me:pos-a",
      kind: "opening",
      gameId: "new",
      opponent: "rival",
      color: "w",
      answers: ["Nf3"],
      played: "Qh5",
      index: 2,
    });
    expect(cards[0].headline).toBe("Qh5 gives up about 0.9 pawns here");
    expect(cards[0].detail).toContain("2 times");
    expect(cards[0].detail).toContain("2.Nf3 Nc6 3.Bb5");
  });

  it("skips positions seen once, and positions where nothing was lost", () => {
    expect(openingCards([summary({ openingMoves: [move({})] })])).toEqual([]);
    const fine = [
      summary({ gameId: "a", openingMoves: [move({ loss: 30 })] }),
      summary({ gameId: "b", openingMoves: [move({ loss: 60 })] }),
    ];
    expect(openingCards(fine)).toEqual([]);
  });

  it("orders cards by how early the position comes up, and adds only new ones", () => {
    const games = ["a", "b"].map((id) =>
      summary({ gameId: id, openingMoves: [move({ key: "late", ply: 12 }), move({ key: "early", ply: 4 })] })
    );
    const cards = openingCards(games);
    expect(cards.map((c) => c.index)).toEqual([4, 12]);
    expect(missingCards(cards, [cards[0]]).map((c) => c.id)).toEqual([cards[1].id]);
  });

  it("caps the drill at five minutes a day", () => {
    expect(DAILY_SECONDS).toBe(300);
    expect(secondsLeft(0)).toBe(300);
    expect(secondsLeft(250)).toBe(50);
    expect(secondsLeft(900)).toBe(0);
    expect(cardSeconds(0, 12_400)).toBe(12);
    // A long pause on one card counts as a minute at most.
    expect(cardSeconds(0, 600_000)).toBe(60);
  });
});

describe("progress", () => {
  const wed = new Date(2026, 2, 4, 12).getTime(); // Wednesday 4 March 2026
  const DAY = 86_400_000;

  it("starts weeks on Monday", () => {
    const start = new Date(weekStart(wed));
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getDay(), start.getHours()]).toEqual([2026, 2, 2, 1, 0]);
    expect(weekStart(weekStart(wed))).toBe(weekStart(wed));
    expect(dateKey(wed)).toBe("2026-03-04");
  });

  it("builds a weekly trend with blunders per 100 moves and winning chances lost per move", () => {
    const games = [
      summary({ gameId: "a", playedAt: wed, playerMoves: 40, blunders: 2, lostTotal: 60, playerRating: 1210 }),
      summary({ gameId: "b", playedAt: wed - DAY, playerMoves: 60, blunders: 1, lostTotal: 40, playerRating: 1190 }),
      summary({ gameId: "c", playedAt: wed - 7 * DAY, playerMoves: 50, blunders: 4, lostTotal: 100, playerRating: 1150 }),
      summary({ gameId: "d", playedAt: wed, timeClass: TimeClass.BULLET, playerMoves: 0, blunders: 0, lostTotal: 0, playerRating: 900 }),
    ];
    const trend = weeklyTrend(games, wed, 4);
    expect(trend).toHaveLength(4);
    expect(trend.map((p) => p.games)).toEqual([0, 0, 1, 3]);
    expect(trend[3]).toMatchObject({ label: "2 Mar", blundersPer100: 3, lostPerMove: 1, rating: 1200 });
    expect(trend[2]).toMatchObject({ label: "23 Feb", blundersPer100: 8, lostPerMove: 2, rating: 1150 });
    expect(trend[0]).toMatchObject({ blundersPer100: null, lostPerMove: null, rating: null });
    expect(mainTimeClass(games)).toBe(TimeClass.RAPID);
  });

  it("averages accuracy per phase over the games that reached it", () => {
    const result = phaseAccuracy([
      summary({ phaseAccuracy: { opening: 90, middlegame: 70, endgame: null } }),
      summary({ phaseAccuracy: { opening: 80, middlegame: 60, endgame: 50 } }),
    ]);
    expect(result).toEqual([
      { phase: "Opening", accuracy: 85, games: 2 },
      { phase: "Middlegame", accuracy: 65, games: 2 },
      { phase: "Endgame", accuracy: 50, games: 1 },
    ]);
    expect(phaseAccuracy([])[0]).toEqual({ phase: "Opening", accuracy: null, games: 0 });
  });

  it("adds up practice", () => {
    let day: PracticeDay = { username: "me", date: "2026-03-04", counts: {} };
    day = addPractice(day, "deck", true);
    day = addPractice(day, "deck", false);
    day = addPractice(day, "opening", true, 20);
    day = addPractice(day, "puzzle", true);
    expect(day.counts.deck).toEqual({ seen: 2, correct: 1 });
    expect(day.openingSeconds).toBe(20);
    expect(practiceTotals([day], ["deck", "opening"])).toEqual({ seen: 3, correct: 2, accuracy: 67 });
    expect(practiceTotals([day], ["endgame"])).toEqual({ seen: 0, correct: 0, accuracy: null });
  });

  it("sums the week up against the one before", () => {
    const games = [
      summary({ gameId: "a", playedAt: wed, playerMoves: 50, blunders: 1, lostTotal: 50 }),
      summary({ gameId: "c", playedAt: wed - 7 * DAY, playerMoves: 50, blunders: 3, lostTotal: 100 }),
    ];
    const log: PracticeDay[] = [
      { username: "me", date: "2026-03-03", counts: { deck: { seen: 4, correct: 3 }, puzzle: { seen: 10, correct: 7 } } },
      { username: "me", date: "2026-02-25", counts: { deck: { seen: 9, correct: 9 } } },
    ];
    const week = weekCard(games, log, wed);
    expect(week).toMatchObject({ games: 1, blundersPer100: 2, lostPerMove: 1, practiceDays: 1, blunderChange: -4, lostChange: -1 });
    expect(week.deck).toEqual({ seen: 4, correct: 3, accuracy: 75 });
    expect(week.puzzles.accuracy).toBe(70);
    expect(week.headline).toBe("Fewer blunders than last week: 2 per 100 moves, down from 6.");

    expect(weekCard([], [], wed).headline).toContain("Nothing yet this week");
    expect(weekCard([], log, wed).headline).toBe("You practised on 1 day this week.");
  });
});

describe("PGN export", () => {
  it("writes a card as a game that starts from its position", () => {
    const pgn = cardToPgn(card(), "Me");
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${card().fen}"]`);
    expect(pgn).toContain('[White "Me"]');
    expect(pgn).toContain('[Black "them"]');
    // Quotes and braces in the text cannot break the file.
    expect(pgn).toContain("[Event \"Mistake deck: 4.Nxe5 walks into a 'fork'\"]");
    expect(pgn).toContain("Black answers Qg5 and wins material.");
    // The move played is a red arrow, the better move a green one.
    expect(pgn).toContain("[%cal Rf3e5]");
    expect(pgn).toContain("4. Nxd4 { Better, because it takes the knight. [%cal Gf3d4] } exd4 5. O-O *");
  });

  it("numbers a line that starts with Black to move", () => {
    const black = card({
      fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
      color: "b",
      answers: ["Nc6", "Nf6"],
      line: ["Nc6", "Bb5", "a6"],
      played: "f6",
      why: null,
    });
    const pgn = cardToPgn(black, "Me");
    expect(pgn).toContain('[White "them"]');
    expect(pgn).toContain('[Black "Me"]');
    expect(pgn).toContain("2... Nc6 { Better. Nf6 is about as good. [%cal Gb8c6] } 3. Bb5 a6 *");
  });

  it("produces games chess.js can read back", () => {
    const pgn = deckToPgn([card(), card({ id: "g1:8", kind: "opening" })], "Me");
    const games = pgn.split(/\n(?=\[Event )/);
    expect(games).toHaveLength(2);
    expect(games[1]).toContain("Opening drill");
    for (const game of games) {
      const chess = new Chess();
      chess.loadPgn(game);
      expect(chess.history()).toEqual(["Nxd4", "exd4", "O-O"]);
      expect(chess.getComments().length).toBeGreaterThan(0);
    }
  });

  it("names the file after the player and the date", () => {
    expect(exportFileName("Me", new Date(2026, 2, 4).getTime())).toBe("chess-coach-deck-me-2026-03-04.pgn");
  });
});

describe("practice storage", () => {
  afterEach(async () => {
    await closeDb();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });

  it("keeps a puzzle rating per skill", async () => {
    const fresh = await loadStats("Me");
    expect(Object.keys(fresh).sort()).toEqual([...PUZZLE_SKILLS].sort());
    expect(fresh.endgame.rating).toBe(START_RATING);

    await saveStat(updateStat(fresh.endgame, 1300, true));
    const again = await loadStats("me");
    expect(again.endgame).toMatchObject({ played: 1, solved: 1 });
    expect(again.endgame.rating).toBeGreaterThan(START_RATING);
    expect(again.plans.played).toBe(0);
  });

  it("logs practice by day, separately from the puzzle ratings", async () => {
    const monday = new Date(2026, 2, 2, 9).getTime();
    await logPractice("Me", "puzzle", true, 0, monday);
    await logPractice("me", "puzzle", false, 0, monday);
    await logPractice("me", "opening", true, 25, monday + 86_400_000);
    await saveStat(newStat("me", "endgame"));

    expect((await loadPracticeDay("me", monday)).counts.puzzle).toEqual({ seen: 2, correct: 1 });
    const log = await loadPracticeLog("me");
    expect(log.map((d) => d.date)).toEqual(["2026-03-02", "2026-03-03"]);
    expect(log[1].openingSeconds).toBe(25);
    expect(await loadPracticeLog("someone")).toEqual([]);
  });
});
