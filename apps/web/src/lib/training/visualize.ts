/**
 * Visualization exercises: read a short line from a position without the
 * pieces moving, then answer one question about the position at the end.
 * Questions and answers are computed with chess.js, so grading is exact.
 */
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { PIECE_NAME, materialBalance, replay } from '@/lib/coach/board';

export const MIN_LINE = 4;
export const MAX_LINE = 6;

export type QuestionKind = 'square' | 'captures' | 'check' | 'material' | 'defended';

export interface VisQuestion {
  kind: QuestionKind;
  prompt: string;
  options: string[];
  answer: string;
  /** Shown after answering. */
  explain: string;
}

export interface VisExercise {
  fen: string;
  /** The line in SAN, between 4 and 6 half-moves. */
  line: string[];
  /**
   * The line as text with from and to squares, e.g. "12.Nf3-e5 d6-e5 13.Qd1-d8".
   * It deliberately has no capture or check marks: those would answer the question.
   */
  text: string;
  finalFen: string;
  /** Who is to move in the starting position. */
  turn: Color;
  question: VisQuestion;
}

const KINDS: QuestionKind[] = ['square', 'captures', 'check', 'material', 'defended'];
const SIDE = { w: 'White', b: 'Black' } as const;

/** Small deterministic random generator, so an exercise is reproducible from its seed. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One move as "Nf3-e5": the piece and its squares, with nothing about captures or checks. */
export function plainMove(move: Pick<Move, 'san' | 'piece' | 'from' | 'to' | 'promotion'>): string {
  if (move.san.startsWith('O-O')) return move.san.replace(/[+#]/g, '');
  const piece = move.piece === 'p' ? '' : move.piece.toUpperCase();
  const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
  return `${piece}${move.from}-${move.to}${promotion}`;
}

/** A line with move numbers, written with `plainMove`. */
export function plainLine(fen: string, moves: Pick<Move, 'san' | 'piece' | 'from' | 'to' | 'promotion'>[]): string {
  const parts = fen.split(' ');
  let moveNo = parseInt(parts[5] ?? '1', 10) || 1;
  let white = parts[1] !== 'b';
  const out: string[] = [];
  moves.forEach((move, i) => {
    const text = plainMove(move);
    if (white) out.push(`${moveNo}.${text}`);
    else out.push(i === 0 ? `${moveNo}...${text}` : text);
    if (!white) moveNo++;
    white = !white;
  });
  return out.join(' ');
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function describe(piece: { color: Color; type: PieceSymbol } | null | undefined): string {
  return piece ? `${SIDE[piece.color]} ${PIECE_NAME[piece.type]}` : 'Empty';
}

function squareQuestion(start: Chess, end: Chess, squares: Square[], rand: () => number): VisQuestion {
  // Ask about a square the line touched, preferring one where the answer changed.
  const changed = squares.filter((sq) => describe(start.get(sq)) !== describe(end.get(sq)));
  const pool = changed.length ? changed : squares;
  const square = pool[Math.floor(rand() * pool.length)];
  const answer = describe(end.get(square));

  const candidates = new Set<string>(['Empty', describe(start.get(square))]);
  for (const sq of squares) {
    candidates.add(describe(end.get(sq)));
    candidates.add(describe(start.get(sq)));
  }
  for (const color of ['w', 'b'] as const) {
    for (const type of ['n', 'b', 'r', 'q', 'p'] as const) candidates.add(describe({ color, type }));
  }
  candidates.delete(answer);
  const wrong = [...candidates].slice(0, 6);
  const options = shuffle([answer, ...shuffle(wrong, rand).slice(0, 3)], rand);
  return {
    kind: 'square',
    prompt: `What is on ${square} at the end of the line?`,
    options,
    answer,
    explain: answer === 'Empty' ? `${square} is empty.` : `There is a ${answer.toLowerCase()} on ${square}.`,
  };
}

/**
 * Build an exercise from a position and a line. Returns null when fewer than
 * four half-moves of the line are legal.
 */
export function makeExercise(fen: string, sans: string[], seed: number, kind?: QuestionKind): VisExercise | null {
  const { chess: end, moves } = replay(fen, sans.slice(0, MAX_LINE));
  if (moves.length < MIN_LINE) return null;

  const rand = seeded(seed);
  const start = new Chess(fen);
  const line = moves.map((m) => m.san);
  const chosen = kind ?? KINDS[Math.floor(rand() * KINDS.length)];

  let question: VisQuestion;
  if (chosen === 'captures') {
    const count = moves.filter((m) => m.captured).length;
    question = {
      kind: 'captures',
      prompt: 'How many captures are there in this line?',
      options: ['0', '1', '2', '3', '4 or more'],
      answer: count >= 4 ? '4 or more' : String(count),
      explain: count === 0 ? 'Nothing is captured.' : `Captures: ${moves.filter((m) => m.captured).map((m) => m.san).join(', ')}.`,
    };
  } else if (chosen === 'check') {
    const inCheck = end.isCheck();
    question = {
      kind: 'check',
      prompt: `Is ${SIDE[end.turn()]}'s king in check at the end of the line?`,
      options: ['Yes', 'No'],
      answer: inCheck ? 'Yes' : 'No',
      explain: inCheck
        ? `${line[line.length - 1]} gives ${end.isCheckmate() ? 'checkmate' : 'check'}.`
        : `${line[line.length - 1]} does not give check.`,
    };
  } else if (chosen === 'defended') {
    // The piece that made the last move: is it protected where it landed?
    const lastMove = moves[moves.length - 1];
    const piece = end.get(lastMove.to)!;
    const defenders = end.attackers(lastMove.to, piece.color).length;
    const name = `${SIDE[piece.color].toLowerCase()} ${PIECE_NAME[piece.type]}`;
    question = {
      kind: 'defended',
      prompt: `At the end, is the ${name} on ${lastMove.to} defended by another ${SIDE[piece.color]} piece?`,
      options: ['Yes', 'No'],
      answer: defenders > 0 ? 'Yes' : 'No',
      explain:
        defenders > 0
          ? `It is defended ${defenders === 1 ? 'once' : `${defenders} times`}.`
          : `Nothing defends the ${PIECE_NAME[piece.type]} on ${lastMove.to}.`,
    };
  } else if (chosen === 'material') {
    const swing = materialBalance(end, 'w') - materialBalance(start, 'w');
    const answer = swing > 0 ? 'White' : swing < 0 ? 'Black' : 'Neither';
    const points = Math.abs(swing);
    question = {
      kind: 'material',
      prompt: 'Who wins material in this line?',
      options: ['White', 'Black', 'Neither'],
      answer,
      explain: swing === 0 ? 'Material stays level.' : `${answer} comes out ${points} point${points === 1 ? '' : 's'} ahead.`,
    };
  } else {
    const squares = [...new Set(moves.flatMap((m) => [m.from, m.to]))] as Square[];
    question = squareQuestion(start, end, squares, rand);
  }

  return { fen, line, text: plainLine(fen, moves), finalFen: end.fen(), turn: start.turn(), question };
}

export function gradeAnswer(question: VisQuestion, choice: string): boolean {
  return choice === question.answer;
}
