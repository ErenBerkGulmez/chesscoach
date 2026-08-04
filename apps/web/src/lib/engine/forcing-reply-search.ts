import type { MoveAnalysis } from '@/types/chess';
import { Chess, Square, PieceSymbol } from 'chess.js';

export interface ForcingReply {
  uci: string;
  san: string;
  piece: PieceSymbol;
  pieceName: string;
  from: Square;
  to: Square;
  isCapture: boolean;
  capturedPiece?: PieceSymbol;
  capturedPieceName?: string;
  isCheck: boolean;
  isPromotion: boolean;
  promotedPiece?: PieceSymbol;
  replyType: 'CHECK' | 'CAPTURE' | 'PROMOTION' | 'TACTICAL_ATTACK' | 'NORMAL_REPLY';
  concreteDescription: string;
  minimumProofLineSan: string[];
}

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export function searchForcingReply(analysis: MoveAnalysis): ForcingReply | null {
  const pvLines = analysis.pvLines || [];
  if (pvLines.length === 0 || !pvLines[0].pv || pvLines[0].pv.length === 0) {
    return null;
  }

  const topPv = pvLines[0];
  const replyUci = topPv.pv[0];
  if (!replyUci || replyUci.length < 4) return null;

  try {
    const chess = new Chess(analysis.fen);
    const from = replyUci.substring(0, 2) as Square;
    const to = replyUci.substring(2, 4) as Square;
    const promotion = replyUci.length > 4 ? replyUci[4] : undefined;

    const moveObj = chess.move({
      from,
      to,
      promotion: promotion as PieceSymbol | undefined,
    });

    if (!moveObj) return null;

    const replySan = topPv.pvSan?.[0] || moveObj.san;
    const piece = moveObj.piece;
    const pieceName = PIECE_NAMES[piece] || 'piece';
    const isCapture = !!moveObj.captured;
    const capturedPiece = moveObj.captured as PieceSymbol | undefined;
    const capturedPieceName = capturedPiece ? PIECE_NAMES[capturedPiece] : undefined;
    const isCheck = chess.isCheck();
    const isPromotion = !!moveObj.promotion;
    const promotedPiece = moveObj.promotion as PieceSymbol | undefined;

    let replyType: ForcingReply['replyType'] = 'NORMAL_REPLY';
    if (isCheck) replyType = 'CHECK';
    else if (isCapture) replyType = 'CAPTURE';
    else if (isPromotion) replyType = 'PROMOTION';
    else replyType = 'TACTICAL_ATTACK';

    let concreteDescription = '';
    if (isCapture && capturedPieceName) {
      concreteDescription = `Opponent's ${pieceName} immediately captures your ${capturedPieceName} on ${to} (${replySan})`;
    } else if (isCheck) {
      concreteDescription = `Opponent plays ${replySan}, putting your King in check`;
    } else if (isPromotion) {
      concreteDescription = `Opponent promotes a pawn on ${to} (${replySan})`;
    } else {
      concreteDescription = `Opponent responds with ${replySan}, creating immediate tactical pressure`;
    }

    const proofLineSan: string[] = [replySan];
    if (topPv.pvSan && topPv.pvSan.length > 1) {
      proofLineSan.push(topPv.pvSan[1]);
      if (topPv.pvSan.length > 2) {
        proofLineSan.push(topPv.pvSan[2]);
      }
    }

    return {
      uci: replyUci,
      san: replySan,
      piece,
      pieceName,
      from,
      to,
      isCapture,
      capturedPiece,
      capturedPieceName,
      isCheck,
      isPromotion,
      promotedPiece,
      replyType,
      concreteDescription,
      minimumProofLineSan: proofLineSan,
    };
  } catch (e) {
    console.warn('[ForcingReplySearch] Error analyzing reply:', e);
    return null;
  }
}
