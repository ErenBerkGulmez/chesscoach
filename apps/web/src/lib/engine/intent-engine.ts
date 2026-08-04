import type { MoveAnalysis } from '@/types/chess';
import { EvaluationSeverity, isCatastrophic, isSerious, canUsePositiveLanguage } from './severity-model';

export type PlayerMoveIntent =
  | 'DEVELOP_PIECE'
  | 'ATTACK_KING'
  | 'DEFEND_THREAT'
  | 'TRADE_PIECES'
  | 'SIMPLIFY'
  | 'WIN_MATERIAL'
  | 'PROTECT_KING'
  | 'GAIN_SPACE'
  | 'PAWN_BREAK'
  | 'ACTIVATE_ROOK'
  | 'CHALLENGE_CENTER'
  | 'PROMOTE_PAWN';

export type ExplanationIntent =
  | 'TACTICAL_PUNISHMENT'
  | 'STRATEGIC_MISTAKE'
  | 'OPENING_PRINCIPLE'
  | 'ENDGAME_TECHNIQUE'
  | 'POSITIONAL_DETERIORATION'
  | 'INITIATIVE_BUILDING'
  | 'CONVERSION'
  | 'PROPHYLAXIS'
  | 'CATASTROPHIC_FAILURE';

export interface IntentAnalysis {
  inferredPlayerIntent: PlayerMoveIntent;
  playerIntentLabel: string;
  explanationIntent: ExplanationIntent;
  actualOutcome: string;
  intentMismatchText: string;
}

export function analyzeIntents(analysis: MoveAnalysis, severity?: EvaluationSeverity): IntentAnalysis {
  const uci = analysis.uciMove;
  const san = analysis.sanMove;
  const isCapture = analysis.isCapture;
  const isCastle = analysis.isCastle;
  const isCheck = analysis.isCheck;
  const isPromotion = analysis.isPromotion;

  let inferredPlayerIntent: PlayerMoveIntent = 'DEVELOP_PIECE';
  let playerIntentLabel = 'Develop a piece';

  if (isPromotion) {
    inferredPlayerIntent = 'PROMOTE_PAWN';
    playerIntentLabel = 'Promote the pawn';
  } else if (isCastle) {
    inferredPlayerIntent = 'PROTECT_KING';
    playerIntentLabel = 'Protect the King and connect Rooks';
  } else if (isCapture) {
    inferredPlayerIntent = 'WIN_MATERIAL';
    playerIntentLabel = 'Win material or exchange pieces';
  } else if (isCheck) {
    inferredPlayerIntent = 'ATTACK_KING';
    playerIntentLabel = 'Attack the opponent King';
  } else if (san.startsWith('R') || uci.includes('d1') || uci.includes('e1') || uci.includes('d8') || uci.includes('e8')) {
    inferredPlayerIntent = 'ACTIVATE_ROOK';
    playerIntentLabel = 'Activate a Rook onto a central file';
  } else if (san === 'e4' || san === 'd4' || san === 'e5' || san === 'd5') {
    inferredPlayerIntent = 'CHALLENGE_CENTER';
    playerIntentLabel = 'Claim central pawn territory';
  }

  let explanationIntent: ExplanationIntent = 'INITIATIVE_BUILDING';

  if (severity && isCatastrophic(severity)) {
    explanationIntent = 'CATASTROPHIC_FAILURE';
  } else if (severity && isSerious(severity)) {
    explanationIntent = 'TACTICAL_PUNISHMENT';
  } else if (severity && severity.centipawnLoss >= 50) {
    explanationIntent = 'STRATEGIC_MISTAKE';
  } else if (analysis.moveNumber <= 10) {
    explanationIntent = 'OPENING_PRINCIPLE';
  }

  let actualOutcome = '';
  let intentMismatchText = '';
  const cls = analysis.classification;

  if (cls === 'BEST' || cls === 'GREAT' || cls === 'BRILLIANT') {
    actualOutcome = `Successfully achieved ${playerIntentLabel.toLowerCase()} while maintaining peak position evaluation.`;
    intentMismatchText = `Player intent aligned perfectly with the optimal board continuation.`;
  } else if (severity && isCatastrophic(severity)) {
    const evalShift = Math.abs(severity.evalDeltaPlayer / 100).toFixed(1);
    actualOutcome = `The idea to ${playerIntentLabel.toLowerCase()} is understandable, but the execution allows a forced tactical sequence losing ${evalShift} pawns.`;
    intentMismatchText = `Intent was correct, but the execution fails tactically — the position collapses.`;
  } else if (severity && isSerious(severity)) {
    const evalShift = Math.abs(severity.evalDeltaPlayer / 100).toFixed(1);
    actualOutcome = `Attempted to ${playerIntentLabel.toLowerCase()}, but conceded ${evalShift} pawns through a tactical oversight.`;
    intentMismatchText = `Intent was reasonable, but execution created a serious vulnerability.`;
  } else {
    if (inferredPlayerIntent === 'WIN_MATERIAL') {
      actualOutcome = `Captured material but conceded piece activity and allowed opponent counterplay.`;
      intentMismatchText = `Intent was to win material, but outcome created positional vulnerabilities.`;
    } else if (inferredPlayerIntent === 'ATTACK_KING') {
      actualOutcome = `Delivered a premature check that allowed opponent to improve their piece placement.`;
      intentMismatchText = `Intent was to attack, but outcome allowed opponent to consolidate.`;
    } else {
      actualOutcome = `Made a move that slightly reduced central influence.`;
      intentMismatchText = `Intent was to ${playerIntentLabel.toLowerCase()}, but a more precise option existed.`;
    }
  }

  return {
    inferredPlayerIntent,
    playerIntentLabel,
    explanationIntent,
    actualOutcome,
    intentMismatchText,
  };
}
