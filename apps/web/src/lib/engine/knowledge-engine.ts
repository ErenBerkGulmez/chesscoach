import type { MoveAnalysis, ParsedGame } from '@/types/chess';
import { detectGamePhase, PhaseDetails } from './phase-detector';
import { detectPositionType, PositionTypeDetails } from './position-type-detector';
import { evaluatePieces, PieceEvaluationDetails } from './piece-evaluator';
import { analyzeMaterial, MaterialDetails } from './material-analyzer';
import { analyzePawnStructure, PawnStructureDetails } from './pawn-structure-engine';
import { evaluateKingSafety, KingSafetyDetails } from './king-safety-analyzer';
import { detectTacticalMotifs, DetectedTacticalMotif } from './tactical-pattern-engine';
import { detectStrategicThemes, DetectedStrategicTheme } from './strategic-theme-engine';
import { compareCandidateMoves, ComparisonResult } from './candidate-comparator';
import { classifyMistakeTaxonomy, MistakeTag } from './mistake-classifier';
import { generateReasoning, StructuredReasoning } from './reasoning-engine';
import { generateLearningReport, PlayerWeaknessReport } from './learning-engine';
import { buildNlgExplanation, CoachingExplanation } from './nlg-builder';

import { planExplanation, ExplanationPlan } from './explanation-planner';
import { analyzeIntents, IntentAnalysis } from './intent-engine';
import { buildGameNarrative, GameNarrativeState } from './narrative-engine';
import { buildCausalChain, CausalChainResult } from './causal-graph-engine';
import { buildCandidateStory, CandidateStory } from './counterfactual-engine';
import { buildV2NlgExplanation, V2CoachingExplanation, ExplanationMode } from './explanation-flow-nlg';
import { detectPositionThreats, ThreatAnalysisResult } from './threat-detector';
import { diagnoseMoveQuality, MoveDiagnosis } from './move-diagnostician';
import { computeSeverity, EvaluationSeverity } from './severity-model';
import { validateReasoningConsistency, ValidationResult } from './reasoning-validator';
import { searchForcingReply, ForcingReply } from './forcing-reply-search';
import { extractExplanationReasoning, ExplanationReasoning } from './reason-extractor';
import { ExplanationHistory } from './diversity-controller';

export interface FullMoveKnowledgeReport {
  analysis: MoveAnalysis;
  phaseDetails: PhaseDetails;
  posTypeDetails: PositionTypeDetails;
  pieceDetails: PieceEvaluationDetails;
  materialDetails: MaterialDetails;
  pawnDetails: PawnStructureDetails;
  kingSafetyDetails: KingSafetyDetails;
  tacticalMotifs: DetectedTacticalMotif[];
  strategicThemes: DetectedStrategicTheme[];
  candidateComparison: ComparisonResult;
  mistakeTags: MistakeTag[];
  reasoning: StructuredReasoning;
  explanation: CoachingExplanation;

  explanationPlan: ExplanationPlan;
  intentAnalysis: IntentAnalysis;
  narrativeState: GameNarrativeState;
  causalChain: CausalChainResult;
  candidateStory: CandidateStory | null;
  v2Explanation: V2CoachingExplanation;

  threatAnalysis: ThreatAnalysisResult;
  moveDiagnosis: MoveDiagnosis;

  severity: EvaluationSeverity;
  forcingReply: ForcingReply | null;
  extractedReasoning: ExplanationReasoning;
  validationResult: ValidationResult;
}

export class ChessKnowledgeEngine {
  public analyzeMove(
    analysis: MoveAnalysis,
    mode: ExplanationMode = 'NORMAL',
    openingName?: string,
    allMoveAnalyses: Record<number, MoveAnalysis> = {},
    gameId: string = 'game',
    history?: ExplanationHistory
  ): FullMoveKnowledgeReport {
    // 1. Step 0: Objective Severity & Forcing Reply
    const severity = computeSeverity(analysis);
    const forcingReply = searchForcingReply(analysis);

    // 2. Position & Tactical Analysis
    const phaseDetails = detectGamePhase(
      analysis.fen,
      analysis.moveNumber,
      analysis.evalAfter ?? 0
    );

    const posTypeDetails = detectPositionType(
      analysis.fen,
      analysis.evalDelta ?? 0,
      analysis.isCheck
    );

    const pieceDetails = evaluatePieces(analysis.fen);
    const materialDetails = analyzeMaterial(analysis.fen);
    const pawnDetails = analyzePawnStructure(analysis.fen);
    const kingSafetyDetails = evaluateKingSafety(analysis.fen);

    const tacticalMotifs = detectTacticalMotifs(analysis);
    const strategicThemes = detectStrategicThemes(analysis, posTypeDetails, pawnDetails);

    const candidateComparison = compareCandidateMoves(analysis);
    const mistakeTags = classifyMistakeTaxonomy(analysis, phaseDetails.phase);

    const threatAnalysis = detectPositionThreats(analysis);
    const moveDiagnosis = diagnoseMoveQuality(analysis, phaseDetails.phase, severity);

    // 3. Structured Reason Extraction (V3 Core)
    const extractedReasoning = extractExplanationReasoning(analysis, severity, threatAnalysis);

    // 4. Downstream Engine Modules
    const explanationPlan = planExplanation(
      analysis,
      tacticalMotifs,
      strategicThemes,
      mistakeTags,
      severity
    );

    const intentAnalysis = analyzeIntents(analysis, severity);

    const narrativeState = buildGameNarrative(
      allMoveAnalyses,
      analysis.moveNumber,
      severity
    );

    const causalChain = buildCausalChain(
      analysis,
      explanationPlan,
      intentAnalysis,
      tacticalMotifs,
      mistakeTags,
      severity,
      forcingReply
    );

    const candidateStory = buildCandidateStory(analysis, severity, forcingReply);

    const reasoning = generateReasoning(
      analysis,
      phaseDetails,
      posTypeDetails,
      tacticalMotifs,
      strategicThemes,
      candidateComparison,
      mistakeTags,
      severity
    );

    const explanation = buildNlgExplanation(
      analysis,
      reasoning,
      'TECHNICAL',
      phaseDetails,
      posTypeDetails,
      tacticalMotifs,
      strategicThemes,
      candidateComparison,
      openingName
    );

    // 5. V3 Two-Mode NLG Synthesis (Normal vs Technical)
    const v2Explanation = buildV2NlgExplanation(
      analysis,
      explanationPlan,
      intentAnalysis,
      narrativeState,
      causalChain,
      candidateStory,
      reasoning,
      mode,
      severity,
      extractedReasoning,
      gameId,
      history
    );

    // 6. Final Consistency & Completeness Validation
    const validationResult = validateReasoningConsistency(
      severity,
      v2Explanation,
      moveDiagnosis,
      narrativeState,
      explanationPlan,
      extractedReasoning
    );

    return {
      analysis,
      phaseDetails,
      posTypeDetails,
      pieceDetails,
      materialDetails,
      pawnDetails,
      kingSafetyDetails,
      tacticalMotifs,
      strategicThemes,
      candidateComparison,
      mistakeTags,
      reasoning,
      explanation,

      explanationPlan,
      intentAnalysis,
      narrativeState,
      causalChain,
      candidateStory,
      v2Explanation,

      threatAnalysis,
      moveDiagnosis,

      severity,
      forcingReply,
      extractedReasoning,
      validationResult,
    };
  }

  public generatePlayerReport(moveAnalyses: MoveAnalysis[], games: ParsedGame[] = []): PlayerWeaknessReport {
    return generateLearningReport(moveAnalyses, games);
  }
}

export const knowledgeEngine = new ChessKnowledgeEngine();
