import type { MoveAnalysis } from '@/types/chess';
import { EvaluationSeverity, isCatastrophic, isSerious } from './severity-model';
import { ForcingReply } from './forcing-reply-search';

export interface CandidateStory {
  bestMoveSan: string;
  immediateChange: string;
  shortTermPlan: string;
  eliminatedWeaknesses: string;
  practicalAdvantage: string;
  opponentProblems: string;
}

export function buildCandidateStory(
  analysis: MoveAnalysis,
  severity?: EvaluationSeverity,
  forcingReply?: ForcingReply | null
): CandidateStory | null {
  const bestMove = analysis.bestMoveSan;
  if (!bestMove) return null;

  const played = analysis.sanMove;
  const cls = analysis.classification;
  const isBest = cls === 'BEST' || cls === 'GREAT' || cls === 'BRILLIANT';

  if (isBest) {
    return {
      bestMoveSan: played,
      immediateChange: `Immediately activates ${played} onto its strongest central coordinate.`,
      shortTermPlan: 'Connects pieces and builds toward an active plan.',
      eliminatedWeaknesses: 'Eliminates tactical vulnerabilities.',
      practicalAdvantage: 'Clean and intuitive move to execute.',
      opponentProblems: 'Forces opponent onto the defensive.',
    };
  }

  if (analysis.isPromotion && (severity && (isCatastrophic(severity) || isSerious(severity)))) {
    return {
      bestMoveSan: bestMove,
      immediateChange: `${bestMove} keeps the promotion threat alive while avoiding the immediate capture of the promoted piece.`,
      shortTermPlan: `After ${bestMove}, your position remains winning or balanced without giving the opponent a tactical counter-attack.`,
      eliminatedWeaknesses: `Prevents the tactical refutation that occurs after ${played}.`,
      practicalAdvantage: `${bestMove} is the critical move to preserve your material advantage.`,
      opponentProblems: `With ${bestMove}, your opponent has no forced winning response.`,
    };
  }

  if (severity && isCatastrophic(severity)) {
    const replyText = forcingReply ? `prevents ${forcingReply.san}` : 'avoids the tactical catastrophe';
    return {
      bestMoveSan: bestMove,
      immediateChange: `${bestMove} ${replyText} and maintains structural integrity.`,
      shortTermPlan: `After ${bestMove}, the position remains playable without forced material loss.`,
      eliminatedWeaknesses: `Prevents the immediate tactical collapse created by ${played}.`,
      practicalAdvantage: `${bestMove} is necessary to hold the position.`,
      opponentProblems: `With ${bestMove}, the opponent has no forced winning continuation.`,
    };
  }

  if (severity && isSerious(severity)) {
    return {
      bestMoveSan: bestMove,
      immediateChange: `${bestMove} solves the position's main tactical problem cleanly.`,
      shortTermPlan: `After ${bestMove}, your forces remain active and coordinated.`,
      eliminatedWeaknesses: `Avoids the evaluation concession created by ${played}.`,
      practicalAdvantage: `${bestMove} provides a much safer strategic foundation.`,
      opponentProblems: `Forces your opponent to find precise defensive responses.`,
    };
  }

  return {
    bestMoveSan: bestMove,
    immediateChange: `${bestMove} improves piece activity without structural compromises.`,
    shortTermPlan: `Over the next 2-3 moves, ${bestMove} enables a stronger strategic plan.`,
    eliminatedWeaknesses: `Prevents the small concession created by ${played}.`,
    practicalAdvantage: `${bestMove} provides a cleaner, easier-to-execute plan.`,
    opponentProblems: `Creates practical problems for the opponent.`,
  };
}
