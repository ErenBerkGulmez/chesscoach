/**
 * "Guess the move": play through a classic game from the winner's side and
 * try to find each of their moves. A guess is scored by how its winning
 * chances compare with the move the master played.
 */

export interface MasterGame {
  id: string;
  white: string;
  black: string;
  event: string;
  year: number;
  /** The side whose moves are guessed (the winner). */
  side: 'w' | 'b';
  /** The first full move that is guessed. Earlier moves are played out for you. */
  startMove: number;
  /** Moves only, in SAN. */
  moves: string;
}

/**
 * Classic games played before 1950. The moves of a chess game are facts and
 * these games are long out of any copyright.
 */
export const MASTER_GAMES: MasterGame[] = [
  {
    id: 'opera-1858',
    white: 'Paul Morphy',
    black: 'Duke Karl and Count Isouard',
    event: 'Paris Opera',
    year: 1858,
    side: 'w',
    startMove: 4,
    moves:
      '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#',
  },
  {
    id: 'immortal-1851',
    white: 'Adolf Anderssen',
    black: 'Lionel Kieseritzky',
    event: 'London, the Immortal Game',
    year: 1851,
    side: 'w',
    startMove: 5,
    moves:
      '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#',
  },
  {
    id: 'evergreen-1852',
    white: 'Adolf Anderssen',
    black: 'Jean Dufresne',
    event: 'Berlin, the Evergreen Game',
    year: 1852,
    side: 'w',
    startMove: 7,
    moves:
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7#',
  },
  {
    id: 'steinitz-1895',
    white: 'Wilhelm Steinitz',
    black: 'Curt von Bardeleben',
    event: 'Hastings',
    year: 1895,
    side: 'w',
    startMove: 9,
    moves:
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 d5 8. exd5 Nxd5 9. O-O Be6 10. Bg5 Be7 11. Bxd5 Bxd5 12. Nxd5 Qxd5 13. Bxe7 Nxe7 14. Re1 f6 15. Qe2 Qd7 16. Rac1 c6 17. d5 cxd5 18. Nd4 Kf7 19. Ne6 Rhc8 20. Qg4 g6 21. Ng5+ Ke8 22. Rxe7+ Kf8 23. Rf7+ Kg8 24. Rg7+ Kh8 25. Rxh7+',
  },
  {
    id: 'reti-1910',
    white: 'Richard Réti',
    black: 'Savielly Tartakower',
    event: 'Vienna',
    year: 1910,
    side: 'w',
    startMove: 5,
    moves: '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Qd3 e5 6. dxe5 Qa5+ 7. Bd2 Qxe5 8. O-O-O Nxe4 9. Qd8+ Kxd8 10. Bg5+ Kc7 11. Bd8#',
  },
  {
    id: 'lasker-1912',
    white: 'Edward Lasker',
    black: 'George Thomas',
    event: 'London',
    year: 1912,
    side: 'w',
    startMove: 6,
    moves:
      '1. d4 e6 2. Nf3 f5 3. Nc3 Nf6 4. Bg5 Be7 5. Bxf6 Bxf6 6. e4 fxe4 7. Nxe4 b6 8. Ne5 O-O 9. Bd3 Bb7 10. Qh5 Qe7 11. Qxh7+ Kxh7 12. Nxf6+ Kh6 13. Neg4+ Kg5 14. h4+ Kf4 15. g3+ Kf3 16. Be2+ Kg2 17. Rh2+ Kg1 18. Kd2#',
  },
];

/** Points for a guess that is exactly the master's move. */
export const FULL_POINTS = 100;

/**
 * Points for one guess, 0-100. The same move as the master, or one that is at
 * least as good, scores full points. Each point of winning chance given up
 * costs four points, so a move 25% worse scores nothing.
 */
export function guessPoints(masterWin: number, guessWin: number, sameMove: boolean): number {
  if (sameMove) return FULL_POINTS;
  const drop = Math.max(0, masterWin - guessWin);
  return Math.max(0, Math.round(FULL_POINTS - 4 * drop));
}

/** Score for a whole game: the average of the points for each guess. */
export function gameScore(points: number[]): number {
  if (points.length === 0) return 0;
  return Math.round(points.reduce((a, b) => a + b, 0) / points.length);
}

export function guessVerdict(points: number, sameMove: boolean): string {
  if (sameMove) return "That is the master's move.";
  if (points >= 95) return 'Just as good as what was played.';
  if (points >= 70) return 'A good move, a little behind what was played.';
  if (points >= 30) return 'Playable, but clearly weaker than what was played.';
  return 'This loses most of the advantage.';
}
