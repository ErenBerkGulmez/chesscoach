/**
 * Concrete, engine-backed explanation of a single move.
 *
 * For a bad move it answers three questions with real squares and lines:
 *   1. What did the move allow or miss? (mate, fork, hanging piece, lost material)
 *   2. What was better, and what does it achieve?
 *   3. What habit would have prevented it?
 */
import { Chess, type Color, type Square } from 'chess.js';
import { evalToWinPercent, formatEval } from '@/lib/stockfish/engine';
import { getGamePhase } from '@/lib/chess/pgn-parser';
import type { MoveAnalysis } from '@/types/chess';
import { MoveClassification, PlayerColor } from '@/types/chess';
import {
  PIECE_NAME,
  PIECE_VALUE,
  forkTargets,
  formatLine,
  isHanging,
  materialName,
  materialSwing,
  other,
  pointsText,
  replay,
} from './board';

export type Motif =
  | 'allowed-mate'
  | 'missed-mate'
  | 'fork'
  | 'hanging-piece'
  | 'lost-material'
  | 'missed-material'
  | 'missed-fork'
  | 'king-safety'
  | 'king-attack'
  | 'endgame'
  | 'positional';

export type Severity = 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface MoveExplanation {
  motif: Motif | null;
  severity: Severity;
  /** Short title, e.g. "24...cxd4 hangs the queen". */
  headline: string;
  /** What the move allowed or missed, with the line that shows it. */
  detail: string;
  better: { san: string; line: string; why: string } | null;
  /** Evaluation before and after from the mover's side, e.g. "+0.4 → -3.1". */
  evalChange: string;
  /** One habit that would have prevented the mistake. */
  takeaway: string | null;
  /** Drop in winning chances for the mover, 0-100. */
  winDrop: number;
}

const BAD = new Set<MoveClassification>([
  MoveClassification.INACCURACY,
  MoveClassification.MISTAKE,
  MoveClassification.BLUNDER,
  MoveClassification.MISSED_WIN,
  MoveClassification.MISSED_MATE,
]);

export const TAKEAWAYS: Record<Motif, string> = {
  'allowed-mate':
    'Before each move, list every check your opponent has after it. Most mates start with a check you did not look at.',
  'missed-mate': 'When the enemy king is short of squares, look at every check first: checks, captures, then threats.',
  fork: 'Look at the squares where an enemy knight or queen could attack two of your pieces at once, and keep your king and big pieces off the same fork pattern.',
  'hanging-piece':
    'Blunder check: before you let go of the piece, ask "what does my move leave undefended?" and "what can capture it?".',
  'lost-material':
    'Count attackers and defenders on each contested square before you start or allow an exchange.',
  'missed-material': "After every opponent move, ask what it left undefended. Free material is the most common thing club players miss.",
  'missed-fork': 'Scan for squares where one of your pieces attacks two targets at once, especially with knight checks.',
  'king-attack': 'When your king has few defenders, count the checks your opponent gets after your move. Bring a piece back or castle first.',
  'king-safety': 'Pawn moves in front of your own king are permanent. Make them only with a concrete reason.',
  endgame: 'In the endgame, activate the king and push passed pawns. Compare plans by counting tempi.',
  positional: 'When there is no tactic, compare your move with the engine move and ask which pieces each one improves.',
};

const sideName = (c: Color) => (c === 'w' ? 'White' : 'Black');

function moverPerspective(a: MoveAnalysis, white: number | null, mate: number | null) {
  const isWhite = a.color === PlayerColor.WHITE;
  return {
    score: white === null ? null : isWhite ? white : -white,
    mate: mate === null ? null : isWhite ? mate : -mate,
  };
}

function severityOf(c: MoveClassification): Severity {
  if (c === MoveClassification.BLUNDER || c === MoveClassification.MISSED_MATE) return 'blunder';
  if (c === MoveClassification.MISTAKE || c === MoveClassification.MISSED_WIN) return 'mistake';
  if (c === MoveClassification.INACCURACY) return 'inaccuracy';
  return 'good';
}

function fmt(score: number | null, mate: number | null) {
  if (mate !== null && mate !== 0) return formatEval(0, mate);
  return formatEval(score ?? 0, null);
}

/** The move-number prefix, e.g. "24..." or "25.". */
function moveLabel(a: MoveAnalysis) {
  return a.color === PlayerColor.WHITE ? `${a.moveNumber}.${a.sanMove}` : `${a.moveNumber}...${a.sanMove}`;
}

/** What the engine's best move achieves, in words. */
function describeBest(a: MoveAnalysis, mover: Color): { san: string; line: string; why: string; gain: number; fork: string | null } | null {
  const best = a.pvLines[0];
  const san = a.bestMoveSan;
  if (!best || !san) return null;
  const pv = best.pvSan?.length ? best.pvSan : [san];
  const line = formatLine(a.fenBefore, pv, 6);

  const bestMate = a.bestMoveMate !== null && a.bestMoveMate > 0 ? a.bestMoveMate : null;
  if (bestMate) return { san, line, why: `it forces mate in ${bestMate}`, gain: 99, fork: null };

  const gain = materialSwing(a.fenBefore, pv, mover);
  const { chess, moves } = replay(a.fenBefore, [san]);
  const first = moves[0];
  let fork: string | null = null;
  if (first) {
    const targets = forkTargets(chess, first.to as Square);
    if (targets.length >= 2) {
      fork = targets.map((t) => `${t.type === 'k' ? 'king' : PIECE_NAME[t.type]} on ${t.square}`).join(' and ');
    }
  }

  let why: string;
  if (first?.captured && gain >= 1) {
    why =
      PIECE_VALUE[first.captured] > gain + 0.5
        ? `the trade on ${first.to} wins ${materialName(gain)} (${pointsText(gain)})`
        : `it takes the ${PIECE_NAME[first.captured]} on ${first.to} and wins ${materialName(gain)} (${pointsText(gain)})`;
  } else if (fork && gain >= 2) {
    why = `it attacks your opponent's ${fork} at once and wins ${materialName(gain)}`;
  } else if (gain >= 2) {
    why = `it wins ${materialName(gain)} (${pointsText(gain)}) by force`;
  } else if (pv.slice(0, 7).some((m) => m.includes('='))) {
    why = 'it pushes a pawn through to promotion';
  } else if (first?.san.includes('+')) {
    why = 'it keeps the initiative with a check';
  } else {
    const ev = fmt(a.bestMoveEval, a.bestMoveMate);
    const played = moverPerspective(a, a.evalAfter, a.mateAfter);
    const mob = mobilityAfter(a.fenBefore, san, mover) - mobilityAfter(a.fenBefore, a.sanMove, mover);
    const activity = mob >= 5 ? ` and gives your pieces ${mob} more moves than ${a.sanMove}` : '';
    why = `it holds ${ev} instead of ${fmt(played.score, played.mate)}${activity}`;
  }
  return { san, line, why, gain, fork };
}

export function explainMove(a: MoveAnalysis): MoveExplanation {
  const mover: Color = a.color === PlayerColor.WHITE ? 'w' : 'b';
  const opp = other(mover);
  const before = moverPerspective(a, a.evalBefore, a.mateBefore);
  const after = moverPerspective(a, a.evalAfter, a.mateAfter);
  const winDrop = Math.max(
    0,
    evalToWinPercent(before.score ?? 0, before.mate) - evalToWinPercent(after.score ?? 0, after.mate)
  );
  const evalChange = `${fmt(before.score, before.mate)} → ${fmt(after.score, after.mate)}`;
  const severity = severityOf(a.classification);
  const label = moveLabel(a);

  if (!BAD.has(a.classification)) {
    const best = a.bestMoveSan && a.bestMoveSan !== a.sanMove ? a.bestMoveSan : null;
    const detail = best
      ? `A solid move. ${best} was the engine's first choice, but the difference is small.`
      : 'This is the engine\'s top move.';
    return { motif: null, severity, headline: `${label} is fine`, detail, better: null, evalChange, takeaway: null, winDrop };
  }

  const reply = a.replyLine ?? [];
  const playedLine = [a.sanMove, ...reply];
  const loss = -materialSwing(a.fenBefore, playedLine, mover);
  const best = describeBest(a, mover);
  const better = best ? { san: best.san, line: best.line, why: best.why } : null;
  const replyText = reply.length ? formatLine(a.fen, reply, 6) : '';
  const phase = getGamePhase(a.fenBefore, a.moveNumber);

  const result = (motif: Motif, headline: string, detail: string): MoveExplanation => ({
    motif,
    severity,
    headline,
    detail,
    better,
    evalChange,
    takeaway: TAKEAWAYS[motif],
    winDrop,
  });

  // 1. Allowed a forced mate.
  if (after.mate !== null && after.mate < 0) {
    const n = Math.abs(after.mate);
    return result(
      'allowed-mate',
      `${label} allows mate in ${n}`,
      `After this move ${sideName(opp)} has a forced mate${replyText ? `: ${replyText}` : ''}.`
    );
  }

  // 2. Missed a forced mate.
  if (before.mate !== null && before.mate > 0 && (after.mate === null || after.mate <= 0 || after.mate > before.mate + 2)) {
    return result(
      'missed-mate',
      `${label} misses mate in ${before.mate}`,
      `You had a forced mate${best ? ` starting with ${best.san}: ${best.line}` : ''}.`
    );
  }

  // 3. Lost material to a concrete reply.
  if (loss >= 2 && reply.length > 0) {
    const { chess: afterReply, moves: replyMoves } = replay(a.fen, reply.slice(0, 1));
    const r = replyMoves[0];
    const lostName = `${materialName(loss)} (${pointsText(loss)})`;

    if (r) {
      const targets = forkTargets(afterReply, r.to as Square);
      if (targets.length >= 2) {
        const names = targets.map((t) => `${t.type === 'k' ? 'king' : PIECE_NAME[t.type]} on ${t.square}`).join(' and ');
        return result(
          'fork',
          `${label} walks into a fork`,
          `${r.san} attacks your ${names} at the same time, and you lose ${lostName}: ${replyText}.`
        );
      }
    }

    // Find the first capture of one of the mover's pieces in the reply line.
    const { moves: lineMoves } = replay(a.fen, reply);
    const chess = new Chess(a.fen);
    for (const m of lineMoves) {
      if (m.color === opp && m.captured && m.captured !== 'p') {
        const hanging = isHanging(chess, m.to as Square);
        const cheaper = PIECE_VALUE[m.piece] < PIECE_VALUE[m.captured];
        const piece = `${PIECE_NAME[m.captured]} on ${m.to}`;
        if (hanging) {
          const moved = m.to === a.uciMove.slice(2, 4);
          return result(
            'hanging-piece',
            `${label} leaves the ${PIECE_NAME[m.captured]} undefended`,
            `${moved ? 'The piece you just moved' : `Your ${piece}`} has no defender, so ${sideName(opp)} simply takes it: ${replyText}. That costs ${lostName}.`
          );
        }
        if (cheaper) {
          return result(
            'lost-material',
            `${label} loses the ${PIECE_NAME[m.captured]}`,
            `${sideName(opp)} wins your ${piece} with a cheaper piece: ${replyText}. That costs ${lostName}.`
          );
        }
        break;
      }
      chess.move(m.san);
    }

    return result(
      'lost-material',
      `${label} loses ${materialName(loss)}`,
      `${sideName(opp)} answers ${replyText} and comes out ${pointsText(loss)} ahead in material.`
    );
  }

  // 4. Missed winning material.
  if (best && best.gain >= 2 && loss < 2) {
    if (best.fork) {
      return result(
        'missed-fork',
        `${label} misses a fork`,
        `${best.san} attacked ${best.fork} at the same time: ${best.line}.`
      );
    }
    return result(
      'missed-material',
      `${label} misses a chance to win ${materialName(best.gain)}`,
      `${best.san} wins ${materialName(best.gain)} (${pointsText(best.gain)}): ${best.line}.`
    );
  }

  // 5. No tactic: name the kind of mistake.
  const moverPiece = new Chess(a.fenBefore).get(a.uciMove.slice(0, 2) as Square);
  const kingSq = findKing(a.fenBefore, mover);
  if (moverPiece?.type === 'p' && kingSq && phase !== 'endgame') {
    const fileDist = Math.abs(a.uciMove.charCodeAt(0) - kingSq.charCodeAt(0));
    const castledSide = kingSq[0] === 'g' || kingSq[0] === 'h' || kingSq[0] === 'b' || kingSq[0] === 'c';
    if (castledSide && fileDist <= 1) {
      return result(
        'king-safety',
        `${label} weakens your king`,
        `This pawn shields your king on ${kingSq}. Pushing it opens lines for ${sideName(opp)}${replyText ? `, who can continue ${replyText}` : ''}.`
      );
    }
  }

  const oppChecks = reply.filter((m, i) => i % 2 === 0 && m.includes('+')).length;
  if (oppChecks >= 2) {
    return result(
      'king-attack',
      `${label} lets ${sideName(opp)} attack your king`,
      `${sideName(opp)} gets a series of checks: ${replyText}. Your king has too few defenders for that.`
    );
  }

  const answer = replyText ? ` ${sideName(opp)}'s best answer is ${replyText}.` : '';
  if (phase === 'endgame') {
    return result('endgame', `${label} is an endgame slip`, `This makes the ending harder to hold.${answer}`);
  }

  return result(
    'positional',
    `${label} ${driftPhrase(before.score, after.score)}`,
    `No piece is lost, but this is a weaker plan than the engine move.${answer}`
  );
}

/** "turns a small edge into a worse position" etc., from the mover's evals. */
function driftPhrase(before: number | null, after: number | null): string {
  const b = before ?? 0;
  const aft = after ?? 0;
  const state = (v: number) => (v >= 150 ? 'a clear advantage' : v >= 50 ? 'a small edge' : v > -50 ? 'equality' : v > -150 ? 'a slightly worse position' : 'a worse position');
  const sb = state(b);
  const sa = state(aft);
  if (sb === sa) return `makes ${sa === 'equality' ? 'your position' : sa} harder to play`;
  return `turns ${sb} into ${sa}`;
}

function mobilityAfter(fen: string, san: string, color: Color): number {
  const { chess, moves } = replay(fen, [san]);
  if (!moves.length) return 0;
  const parts = chess.fen().split(' ');
  parts[1] = color;
  parts[3] = '-';
  try {
    return new Chess(parts.join(' ')).moves().length;
  } catch {
    return 0;
  }
}

function findKing(fen: string, color: Color): Square | null {
  const chess = new Chess(fen);
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.type === 'k' && sq.color === color) return sq.square;
    }
  }
  return null;
}
