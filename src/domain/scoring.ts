/**
 * ECOD scoring engine.
 *
 * Pure functions - no I/O, no framework. Given domain content (questions,
 * blueprint, competencies) and raw assessment inputs (online answers, assessor
 * rubric scores) it produces the full scored result, including capability gaps
 * and enrichment recommendations.
 *
 * Scoring model (documented in ARCHITECTURE.md):
 *  - Every item scores 0-100.
 *      mcq / multi-select : auto-scored against expectedAnswer.
 *      rubric items       : weighted mean of chosen criterion level scores.
 *  - An item's EFFECTIVE WEIGHT inside a competency is:
 *        question.weight x blueprintSection.weight
 *    optionally scoped to just the criteria mapped to that competency
 *    (rubric criteria may carry a competencyCode).
 *  - Competency score = weighted mean of its items' scores.
 *  - Readiness score  = competency-weighted mean (competency.weight).
 *  - Outcome requires BOTH the overall pass mark AND every competency
 *    threshold - "enterprise ready" means no unexplained weak spots.
 */

import type {
  AssessmentBlueprint,
  AssessmentResults,
  AssessorItemScore,
  Competency,
  CompetencyResult,
  CompetencyStatus,
  GapRecord,
  GapSeverity,
  OnlineAnswer,
  Question,
  RoleTrack,
  EnrichmentItem,
} from "./types";
import { buildGaps } from "./gaps";

/* ------------------------------------------------------------------ */
/* Item-level scoring                                                   */
/* ------------------------------------------------------------------ */

/** Auto-score an online answer. Mutates nothing; returns the score. */
export function scoreOnlineAnswer(question: Question, selected: string[]): { score: number; correct: boolean } {
  if (question.type !== "mcq" && question.type !== "multi-select") return { score: 0, correct: false };
  const expected = (question.expectedAnswer ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (expected.length === 0) return { score: 0, correct: false };
  const chosen = selected.filter(Boolean);
  const hits = chosen.filter((c) => expected.includes(c)).length;
  const misses = chosen.filter((c) => !expected.includes(c)).length;
  if (question.type === "mcq") {
    const correct = chosen.length === 1 && expected.includes(chosen[0]);
    return { score: correct ? 100 : 0, correct };
  }
  // multi-select partial credit: credit hits, penalise misses, floor at 0.
  const raw = (hits - misses) / expected.length;
  return { score: Math.max(0, Math.min(100, Math.round(raw * 100))), correct: raw >= 1 };
}

/** Weighted mean of chosen rubric levels for an assessor-scored item. */
export function scoreRubricItem(question: Question, criterionScores: Record<string, number>): number {
  const criteria = question.rubric ?? [];
  if (criteria.length === 0) return 0;
  let totalW = 0;
  let total = 0;
  for (const c of criteria) {
    const s = criterionScores[c.code];
    if (s === undefined) continue;
    const w = c.weight ?? 1;
    total += s * w;
    totalW += w;
  }
  return totalW === 0 ? 0 : Math.round(total / totalW);
}

/**
 * Score contribution of an assessor item towards ONE competency.
 * When rubric criteria carry competencyCode, only those criteria count,
 * and the item's effective weight is reduced to the mapped share -
 * so a 5-criterion case study doesn't flood every tagged competency
 * with its overall score.
 */
export function itemScoreForCompetency(
  question: Question,
  score: AssessorItemScore | undefined,
  autoScore: number | undefined,
  sectionWeight: number,
  competencyCode: string,
): { score: number; weight: number } {
  const baseWeight = (question.weight || 1) * (sectionWeight || 1);
  const criteria = question.rubric ?? [];
  const mapped = criteria.filter((c) => c.competencyCode === competencyCode);

  if (score && criteria.length > 0) {
    if (mapped.length > 0) {
      let totalW = 0;
      let total = 0;
      let allW = 0;
      for (const c of criteria) allW += c.weight ?? 1;
      for (const c of mapped) {
        const s = score.criterionScores[c.code];
        if (s === undefined) continue;
        const w = c.weight ?? 1;
        total += s * w;
        totalW += w;
      }
      if (totalW === 0) return { score: 0, weight: 0 };
      const share = totalW / (allW || 1);
      return { score: Math.round(total / totalW), weight: baseWeight * share };
    }
    // no criterion-level mapping: overall item score feeds each tagged competency
    return { score: score.itemScore ?? scoreRubricItem(question, score.criterionScores), weight: baseWeight };
  }

  if (autoScore !== undefined) return { score: autoScore, weight: baseWeight };
  return { score: 0, weight: 0 };
}

/* ------------------------------------------------------------------ */
/* Assessment-level computation                                         */
/* ------------------------------------------------------------------ */

export interface ComputeInput {
  role: RoleTrack;
  competencies: Competency[];
  blueprint: AssessmentBlueprint;
  questions: Question[];
  onlineAnswers: OnlineAnswer[];
  assessorScores: AssessorItemScore[];
  enrichment: EnrichmentItem[];
}

export function computeResults(input: ComputeInput): AssessmentResults {
  const { role, competencies, blueprint, questions, onlineAnswers, assessorScores, enrichment } = input;

  const questionsByCode = new Map(questions.map((q) => [q.code, q]));
  const answersByCode = new Map(onlineAnswers.map((a) => [a.questionCode, a]));
  const scoresByCode = new Map(assessorScores.map((s) => [s.questionCode, s]));
  const sectionWeightByQuestion = new Map<string, number>();
  const sectionsCovering = (code: string) => {
    if (sectionWeightByQuestion.has(code)) return sectionWeightByQuestion.get(code)!;
    let w = 1;
    for (const s of blueprint.sections) if (s.questionCodes.includes(code)) w = s.weight;
    sectionWeightByQuestion.set(code, w);
    return w;
  };

  const competencyResults: CompetencyResult[] = competencies.map((comp) => {
    let weightSum = 0;
    let scoreSum = 0;
    for (const q of questions) {
      if (!q.competencyCodes.includes(comp.code)) continue;
      const sectionWeight = sectionsCovering(q.code);
      const { score, weight } = itemScoreForCompetency(
        q,
        scoresByCode.get(q.code),
        answersByCode.get(q.code)?.autoScore,
        sectionWeight,
        comp.code,
      );
      scoreSum += score * weight;
      weightSum += weight;
    }
    const assessed = weightSum > 0;
    const score = assessed ? Math.round(scoreSum / weightSum) : 0;
    const gap = assessed ? Math.max(0, comp.threshold - score) : comp.threshold;
    const status: CompetencyStatus = !assessed
      ? "not_assessed"
      : gap === 0
        ? "meets"
        : gap <= 10
          ? "gap_minor"
          : gap <= 25
            ? "gap_major"
            : "gap_critical";
    return {
      competencyCode: comp.code,
      name: comp.name,
      score,
      threshold: comp.threshold,
      weight: comp.weight,
      status,
      gap,
    };
  });

  const assessed = competencyResults.filter((c) => c.status !== "not_assessed");
  const totalWeight = assessed.reduce((s, c) => s + c.weight, 0);
  const readinessScore =
    totalWeight === 0 ? 0 : Math.round(assessed.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);
  const passMark = blueprint.passMark ?? role.passMark;

  const gaps: GapRecord[] = buildGaps(competencyResults, enrichment);
  const notAssessed = competencyResults.filter((c) => c.status === "not_assessed");

  let outcome: AssessmentResults["outcome"];
  if (notAssessed.length > 0) {
    outcome = "not_ready";
  } else if (gaps.length === 0 && readinessScore >= passMark) {
    outcome = "ready_pending_validation";
  } else if (readinessScore >= passMark - 15) {
    outcome = "enrichment_required";
  } else {
    outcome = "not_ready";
  }

  const sorted = [...assessed].sort((a, b) => b.score - a.score);
  const strengths = sorted
    .filter((c) => c.score >= 75)
    .slice(0, 3)
    .map((c) => `${c.name} (${c.score})`);
  const developmentAreas = [
    ...gaps.map((g) => `${g.name} (${g.score} vs required ${g.threshold})`),
    ...notAssessed.map((c) => `${c.name} - not assessed in this blueprint`),
  ].slice(0, 5);

  const summary =
    gaps.length === 0
      ? `Meets all ${competencies.length} RSA competency thresholds with an overall readiness of ${readinessScore}. Recommended for independent validation.`
      : `Overall readiness ${readinessScore} against a pass mark of ${passMark}. ${gaps.length} capability gap${gaps.length > 1 ? "s" : ""} identified (${gaps
          .map((g) => `${g.name}, severity ${g.severity}`)
          .join("; ")}). Targeted enrichment recommended before validation.`;

  return {
    readinessScore,
    passMark,
    outcome,
    competencyResults,
    gaps,
    strengths,
    developmentAreas,
    summary,
    scoredAt: new Date().toISOString(),
  };
}

export function severityFromGap(gap: number): GapSeverity {
  if (gap <= 10) return "minor";
  if (gap <= 25) return "major";
  return "critical";
}

/** True when every assessor-delivered question in the blueprint has a complete score. */
export function assessorScoringComplete(
  blueprint: AssessmentBlueprint,
  questionsByCode: Map<string, Question>,
  assessorScores: AssessorItemScore[],
): { complete: boolean; missing: string[] } {
  const scored = new Map(assessorScores.map((s) => [s.questionCode, s]));
  const missing: string[] = [];
  for (const section of blueprint.sections) {
    if (section.delivery !== "assessor") continue;
    for (const code of section.questionCodes) {
      const q = questionsByCode.get(code);
      const s = scored.get(code);
      if (!q || !s) {
        missing.push(code);
        continue;
      }
      const criteria = q.rubric ?? [];
      const needEvidence = q.type === "case-study";
      const incomplete =
        criteria.some((c) => s.criterionScores[c.code] === undefined) ||
        (criteria.length > 0 && Object.keys(s.criterionScores).length === 0) ||
        (needEvidence && !s.evidence?.trim());
      if (incomplete) missing.push(code);
    }
  }
  return { complete: missing.length === 0, missing };
}
