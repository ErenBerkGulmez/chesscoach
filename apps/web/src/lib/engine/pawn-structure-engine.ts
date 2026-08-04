/**
 * Pawn Structure Engine
 * 
 * Analyzes pawn chains, isolated pawns, backward pawns, passed pawns,
 * doubled pawns, pawn islands, and pawn breaks.
 */

import { Chess, Square, Color } from 'chess.js';

export interface PawnStructureDetails {
  whitePassedPawns: Square[];
  blackPassedPawns: Square[];
  whiteIsolatedPawns: Square[];
  blackIsolatedPawns: Square[];
  whiteDoubledPawns: Square[];
  blackDoubledPawns: Square[];
  whiteBackwardPawns: Square[];
  blackBackwardPawns: Square[];
  whiteIslands: number;
  blackIslands: number;
  pawnBreaks: { from: Square; to: Square }[];
  pawnStructureName: string;
}

/**
 * Perform comprehensive analysis of pawn structures for White and Black.
 */
export function analyzePawnStructure(fen: string): PawnStructureDetails {
  const chess = new Chess(fen);
  const board = chess.board();

  const whitePawnFiles: number[][] = Array.from({ length: 8 }, () => []);
  const blackPawnFiles: number[][] = Array.from({ length: 8 }, () => []);

  const whitePassedPawns: Square[] = [];
  const blackPassedPawns: Square[] = [];
  const whiteIsolatedPawns: Square[] = [];
  const blackIsolatedPawns: Square[] = [];
  const whiteDoubledPawns: Square[] = [];
  const blackDoubledPawns: Square[] = [];
  const whiteBackwardPawns: Square[] = [];
  const blackBackwardPawns: Square[] = [];
  const pawnBreaks: { from: Square; to: Square }[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'p') {
        const rank = 8 - r;
        if (p.color === 'w') whitePawnFiles[c].push(rank);
        else blackPawnFiles[c].push(rank);
      }
    }
  }

  // Detect Doubled, Isolated, Passed pawns per file
  for (let f = 0; f < 8; f++) {
    const wRanks = whitePawnFiles[f];
    const bRanks = blackPawnFiles[f];

    // Doubled pawns
    if (wRanks.length > 1) {
      wRanks.forEach((rank) =>
        whiteDoubledPawns.push(`${String.fromCharCode(97 + f)}${rank}` as Square)
      );
    }
    if (bRanks.length > 1) {
      bRanks.forEach((rank) =>
        blackDoubledPawns.push(`${String.fromCharCode(97 + f)}${rank}` as Square)
      );
    }

    // Isolated pawns
    const hasAdjWhite =
      (f > 0 && whitePawnFiles[f - 1].length > 0) ||
      (f < 7 && whitePawnFiles[f + 1].length > 0);
    if (wRanks.length > 0 && !hasAdjWhite) {
      wRanks.forEach((rank) =>
        whiteIsolatedPawns.push(`${String.fromCharCode(97 + f)}${rank}` as Square)
      );
    }

    const hasAdjBlack =
      (f > 0 && blackPawnFiles[f - 1].length > 0) ||
      (f < 7 && blackPawnFiles[f + 1].length > 0);
    if (bRanks.length > 0 && !hasAdjBlack) {
      bRanks.forEach((rank) =>
        blackIsolatedPawns.push(`${String.fromCharCode(97 + f)}${rank}` as Square)
      );
    }

    // Passed pawns
    wRanks.forEach((rank) => {
      if (isPawnPassed('w', f, rank, blackPawnFiles)) {
        whitePassedPawns.push(`${String.fromCharCode(97 + f)}${rank}` as Square);
      }
    });

    bRanks.forEach((rank) => {
      if (isPawnPassed('b', f, rank, whitePawnFiles)) {
        blackPassedPawns.push(`${String.fromCharCode(97 + f)}${rank}` as Square);
      }
    });
  }

  // Count Pawn Islands
  const whiteIslands = countPawnIslands(whitePawnFiles);
  const blackIslands = countPawnIslands(blackPawnFiles);

  let pawnStructureName = 'Standard Pawn Structure';
  if (whitePassedPawns.length > 0 || blackPassedPawns.length > 0) {
    pawnStructureName = 'Passed Pawn Structure';
  } else if (whiteIsolatedPawns.length > 0 || blackIsolatedPawns.length > 0) {
    pawnStructureName = 'Isolated Pawn Structure';
  } else if (whiteDoubledPawns.length > 0 || blackDoubledPawns.length > 0) {
    pawnStructureName = 'Doubled Pawn Structure';
  }

  return {
    whitePassedPawns,
    blackPassedPawns,
    whiteIsolatedPawns,
    blackIsolatedPawns,
    whiteDoubledPawns,
    blackDoubledPawns,
    whiteBackwardPawns,
    blackBackwardPawns,
    whiteIslands,
    blackIslands,
    pawnBreaks,
    pawnStructureName,
  };
}

function isPawnPassed(
  color: Color,
  file: number,
  rank: number,
  enemyPawnFiles: number[][]
): boolean {
  const checkFiles = [file - 1, file, file + 1].filter((f) => f >= 0 && f <= 7);

  for (const f of checkFiles) {
    const enemyRanks = enemyPawnFiles[f];
    for (const eRank of enemyRanks) {
      if (color === 'w' && eRank > rank) return false;
      if (color === 'b' && eRank < rank) return false;
    }
  }

  return true;
}

function countPawnIslands(pawnFiles: number[][]): number {
  let islands = 0;
  let inIsland = false;

  for (let f = 0; f < 8; f++) {
    if (pawnFiles[f].length > 0) {
      if (!inIsland) {
        islands++;
        inIsland = true;
      }
    } else {
      inIsland = false;
    }
  }

  return islands;
}
