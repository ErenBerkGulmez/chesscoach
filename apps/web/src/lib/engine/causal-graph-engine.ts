import type { MoveAnalysis } from '@/types/chess';
import { ExplanationPlan } from './explanation-planner';
import { IntentAnalysis } from './intent-engine';
import { DetectedTacticalMotif } from './tactical-pattern-engine';
import { MistakeTag } from './mistake-classifier';
import { EvaluationSeverity, isCatastrophic, isSerious } from './severity-model';
import { ForcingReply } from './forcing-reply-search';

export interface CausalNode {
  step: number;
  cause: string;
  effect: string;
  icon: string;
}

export interface CausalChainResult {
  chain: CausalNode[];
  summaryFlowText: string;
}

export function buildCausalChain(
  analysis: MoveAnalysis,
  plan?: ExplanationPlan,
  intents?: IntentAnalysis,
  motifs: DetectedTacticalMotif[] = [],
  mistakes: MistakeTag[] = [],
  severity?: EvaluationSeverity,
  forcingReply?: ForcingReply | null
): CausalChainResult {
  const chain: CausalNode[] = [];
  const played = analysis.sanMove;
  const cpl = Math.abs(analysis.evalDelta ?? 0);
  const isGood = analysis.classification === 'BEST' || analysis.classification === 'GREAT' || analysis.classification === 'BRILLIANT';

  if (isGood) {
    chain.push({
      step: 1,
      cause: `Played ${played}`,
      effect: 'Activated piece onto optimal coordinate',
      icon: '♟',
    });
    chain.push({
      step: 2,
      cause: 'Optimized piece coordination',
      effect: 'Restricted opponent counterplay',
      icon: '🔒',
    });
    chain.push({
      step: 3,
      cause: 'Preserved engine precision',
      effect: 'Maintains evaluation dominance',
      icon: '🏆',
    });

  } else if (analysis.isPromotion && (severity && (isCatastrophic(severity) || isSerious(severity)))) {
    const toSq = analysis.uciMove.substring(2, 4);
    chain.push({
      step: 1,
      cause: `Promoted pawn (${played})`,
      effect: `New queen appears on ${toSq}`,
      icon: '♛',
    });

    if (forcingReply && forcingReply.isCapture) {
      chain.push({
        step: 2,
        cause: `${toSq} square controlled by opponent ${forcingReply.pieceName}`,
        effect: `Opponent captures with ${forcingReply.san}`,
        icon: '💥',
      });
      chain.push({
        step: 3,
        cause: 'Promoted queen is removed',
        effect: 'Material balance collapses',
        icon: '📉',
      });
    } else {
      chain.push({
        step: 2,
        cause: `Promotion square ${toSq} is tactically vulnerable`,
        effect: `Opponent refutes promotion by force`,
        icon: '⚡',
      });
      chain.push({
        step: 3,
        cause: 'No defensive resource available',
        effect: 'Position changes from equal to lost',
        icon: '❌',
      });
    }

  } else if (severity && isCatastrophic(severity)) {
    const evalShift = Math.abs(severity.evalDeltaPlayer / 100).toFixed(1);

    chain.push({
      step: 1,
      cause: `Played ${played}`,
      effect: intents?.playerIntentLabel || 'Moved piece',
      icon: '♟',
    });

    if (forcingReply && forcingReply.concreteDescription) {
      chain.push({
        step: 2,
        cause: 'Created tactical vulnerability',
        effect: forcingReply.concreteDescription,
        icon: '⚡',
      });
      chain.push({
        step: 3,
        cause: 'Uncompensated material or king exposure',
        effect: `Evaluation collapses by −${evalShift} pawns`,
        icon: '💥',
      });
    } else {
      chain.push({
        step: 2,
        cause: 'Created tactical weakness',
        effect: motifs.length > 0 ? `Exposed to ${motifs[0].label}` : 'Opponent has forced winning continuation',
        icon: '⚡',
      });
      chain.push({
        step: 3,
        cause: 'Forced material loss or checkmate threat',
        effect: `Position collapses by −${evalShift} pawns`,
        icon: '❌',
      });
    }

  } else if (severity && isSerious(severity)) {
    const evalShift = Math.abs(severity.evalDeltaPlayer / 100).toFixed(1);

    chain.push({
      step: 1,
      cause: `Played ${played}`,
      effect: intents?.playerIntentLabel || 'Moved piece',
      icon: '♟',
    });
    chain.push({
      step: 2,
      cause: 'Left tactical weakness unaddressed',
      effect: forcingReply ? forcingReply.concreteDescription : (motifs.length > 0 ? `${motifs[0].label} possible` : 'Opponent seizes initiative'),
      icon: '⚠️',
    });
    chain.push({
      step: 3,
      cause: 'Significant concession',
      effect: `Evaluation shifts by −${evalShift} pawns`,
      icon: '📉',
    });

  } else {
    chain.push({
      step: 1,
      cause: `Played ${played}`,
      effect: intents?.actualOutcome || 'Moved piece',
      icon: '♟',
    });

    if (mistakes.some((m) => m.category === 'DEVELOPMENT_MISTAKE')) {
      chain.push({
        step: 2,
        cause: 'Delayed minor piece mobilization',
        effect: 'Development falls behind',
        icon: '⚠️',
      });
    } else {
      chain.push({
        step: 2,
        cause: 'Suboptimal square choice',
        effect: 'Reduces piece active scope',
        icon: '⚡',
      });
    }

    chain.push({
      step: 3,
      cause: 'Minor positional concession',
      effect: `Evaluation shifts by −${(cpl / 100).toFixed(1)} pawns`,
      icon: '📉',
    });
  }

  const summaryFlowText = chain
    .map((c) => `${c.cause} → ${c.effect}`)
    .join(' → ');

  return {
    chain,
    summaryFlowText,
  };
}
