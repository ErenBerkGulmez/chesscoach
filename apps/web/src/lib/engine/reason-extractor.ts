import type { MoveAnalysis } from '@/types/chess';
import { Chess, Square, PieceSymbol } from 'chess.js';
import { EvaluationSeverity, isCatastrophic, isSerious } from './severity-model';
import { ForcingReply, searchForcingReply } from './forcing-reply-search';
import { ThreatAnalysisResult } from './threat-detector';

export type ExplanationReason =
  | 'PROMOTION_TACTICAL_FAILURE'
  | 'PROMOTION_SUCCESS'
  | 'TACTICAL_LOSS'
  | 'HANGING_PIECE'
  | 'OVERLOADED_DEFENDER'
  | 'REMOVAL_OF_DEFENDER'
  | 'PIN'
  | 'FORK'
  | 'SKEWER'
  | 'MATE_THREAT'
  | 'KING_SAFETY_COLLAPSE'
  | 'SACRIFICE_VALIDATED'
  | 'SACRIFICE_REFUTED'
  | 'DEVELOPMENT_DELAY'
  | 'PASSIVE_DEFENSE'
  | 'PAWN_STRUCTURE_WEAKNESS'
  | 'CENTER_CONTROL_CONCEDED'
  | 'MULTI_PURPOSE_OPTIMAL'
  | 'PROPHYLAXIS_OPTIMAL'
  | 'TACTICAL_PRECISION_OPTIMAL'
  | 'OTHER';

export interface TacticalExplanation {
  motif: string;
  attacker?: string;
  target?: string;
  defender?: string;
  criticalReplySan?: string;
  criticalReplyDescription?: string;
  materialSwingCentipawns: number;
  explanation: string;
}

export interface PromotionAnalysis {
  isPromotionMove: boolean;
  promotionSquare?: Square;
  isSquareAttacked: boolean;
  canBeCaptured: boolean;
  attackerPieceName?: string;
  capturingMoveSan?: string;
  failureReason?: string;
}

export interface ExplanationReasoning {
  primaryReason: ExplanationReason;
  severity: EvaluationSeverity;
  forcingReply: ForcingReply | null;
  tacticalCause?: TacticalExplanation;
  promotionAnalysis?: PromotionAnalysis;
  summarySentence: string;
  whyFailedOrSucceeded: string;
  alternativeRationale: string;
  suggestedLesson: string;
}

export function extractExplanationReasoning(
  analysis: MoveAnalysis,
  severity: EvaluationSeverity,
  threats?: ThreatAnalysisResult
): ExplanationReasoning {
  const forcingReply = searchForcingReply(analysis);
  const uci = analysis.uciMove;
  const san = analysis.sanMove;
  const isPromotion = analysis.isPromotion || uci.length === 5;
  const isOptimal = analysis.classification === 'BEST' || analysis.classification === 'GREAT' || analysis.classification === 'BRILLIANT';

  // 1. Analyze Promotion if applicable
  let promotionAnalysis: PromotionAnalysis | undefined = undefined;
  if (isPromotion) {
    const toSq = uci.substring(2, 4) as Square;
    const chessBefore = new Chess(analysis.fenBefore);
    const attackers = chessBefore.attackers(toSq, chessBefore.turn() === 'w' ? 'b' : 'w');
    const isAttacked = attackers.length > 0;

    let capturingMoveSan: string | undefined = undefined;
    let attackerPieceName: string | undefined = undefined;

    if (forcingReply && forcingReply.isCapture && forcingReply.to === toSq) {
      capturingMoveSan = forcingReply.san;
      attackerPieceName = forcingReply.pieceName;
    }

    promotionAnalysis = {
      isPromotionMove: true,
      promotionSquare: toSq,
      isSquareAttacked: isAttacked,
      canBeCaptured: !!capturingMoveSan || isAttacked,
      attackerPieceName,
      capturingMoveSan,
      failureReason: capturingMoveSan
        ? `The newly promoted piece on ${toSq} can immediately be captured by ${capturingMoveSan}.`
        : isAttacked
        ? `The promotion square ${toSq} is controlled by opponent forces.`
        : undefined,
    };
  }

  // 2. Select Primary Reason
  let primaryReason: ExplanationReason = 'OTHER';

  if (isPromotion && (isCatastrophic(severity) || isSerious(severity))) {
    primaryReason = 'PROMOTION_TACTICAL_FAILURE';
  } else if (isPromotion && isOptimal) {
    primaryReason = 'PROMOTION_SUCCESS';
  } else if (isCatastrophic(severity)) {
    if (forcingReply?.isCheck) {
      primaryReason = 'MATE_THREAT';
    } else if (forcingReply?.isCapture) {
      primaryReason = 'HANGING_PIECE';
    } else {
      primaryReason = 'TACTICAL_LOSS';
    }
  } else if (isSerious(severity)) {
    if (forcingReply?.replyType === 'TACTICAL_ATTACK' || forcingReply?.isCapture) {
      primaryReason = 'FORK';
    } else {
      primaryReason = 'TACTICAL_LOSS';
    }
  } else if (isOptimal) {
    if (analysis.isCastle || analysis.moveNumber <= 10) {
      primaryReason = 'DEVELOPMENT_DELAY';
    } else if (analysis.isCapture || analysis.isCheck) {
      primaryReason = 'TACTICAL_PRECISION_OPTIMAL';
    } else {
      primaryReason = 'MULTI_PURPOSE_OPTIMAL';
    }
  } else if (severity.centipawnLoss >= 50) {
    primaryReason = 'PASSIVE_DEFENSE';
  } else {
    primaryReason = 'DEVELOPMENT_DELAY';
  }

  // 3. Build Tactical Cause Detail
  let tacticalCause: TacticalExplanation | undefined = undefined;
  if (forcingReply) {
    tacticalCause = {
      motif: forcingReply.replyType,
      attacker: forcingReply.pieceName,
      criticalReplySan: forcingReply.san,
      criticalReplyDescription: forcingReply.concreteDescription,
      materialSwingCentipawns: severity.centipawnLoss,
      explanation: forcingReply.concreteDescription,
    };
  }

  // 4. Build Concrete Text Sentences
  let summarySentence = '';
  let whyFailedOrSucceeded = '';
  let alternativeRationale = '';
  let suggestedLesson = '';

  const bestSan = analysis.bestMoveSan || 'the recommended alternative';

  if (primaryReason === 'PROMOTION_TACTICAL_FAILURE') {
    summarySentence = `The promotion fails tactically.`;
    if (promotionAnalysis?.capturingMoveSan) {
      whyFailedOrSucceeded = `Promoting with ${san} puts the new queen directly onto ${promotionAnalysis.promotionSquare}, where it can immediately be captured by ${promotionAnalysis.capturingMoveSan}. You lose the promoted piece without adequate compensation.`;
    } else {
      whyFailedOrSucceeded = `Promoting with ${san} allows an immediate tactical refutation by your opponent, converting a strong position into a severe loss.`;
    }
    alternativeRationale = `Playing ${bestSan} keeps the promotion threat alive while first neutralizing the opponent's tactical resource.`;
    suggestedLesson = `Before executing a pawn promotion, verify that the promotion square is safe from immediate captures.`;

  } else if (isCatastrophic(severity) || isSerious(severity)) {
    summarySentence = `This move allows a decisive tactical response.`;
    if (forcingReply?.concreteDescription) {
      whyFailedOrSucceeded = `${san} allows ${forcingReply.concreteDescription}. The tactical sequence leaves your position severely compromised.`;
    } else {
      whyFailedOrSucceeded = `${san} leaves your position exposed to a forced tactical sequence that shifts evaluation by ${(severity.centipawnLoss / 100).toFixed(1)} pawns.`;
    }
    alternativeRationale = `${bestSan} was critical to prevent this tactical vulnerability and maintain positional stability.`;
    suggestedLesson = `Always scan for checks, captures, and opponent threat responses before finalizing your move.`;

  } else if (isOptimal) {
    summarySentence = `${san} is the optimal continuation in this position.`;
    whyFailedOrSucceeded = `${san} maintains peak position evaluation, improves piece coordination, and restricts opponent counterplay.`;
    alternativeRationale = `It is cleaner and more precise than passive alternatives.`;
    suggestedLesson = `Maintain central harmony and active piece placement throughout all phases.`;

  } else {
    summarySentence = `${san} drops slight positional accuracy.`;
    whyFailedOrSucceeded = `While ${san} is playable, it gives up a portion of your initiative.`;
    alternativeRationale = `${bestSan} was more precise, maintaining better piece mobility.`;
    suggestedLesson = `Look for candidate moves that improve your least active piece.`;
  }

  return {
    primaryReason,
    severity,
    forcingReply,
    tacticalCause,
    promotionAnalysis,
    summarySentence,
    whyFailedOrSucceeded,
    alternativeRationale,
    suggestedLesson,
  };
}
