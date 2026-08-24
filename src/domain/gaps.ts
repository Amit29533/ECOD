/**
 * Capability gap generation.
 *
 * Turns scored competency results into an actionable gap map with severity and
 * recommended enrichment drawn from the configurable enrichment catalogue.
 */

import type { CompetencyResult, EnrichmentItem, GapRecord, GapSeverity } from "./types";
import { severityFromGap } from "./scoring";

export function buildGaps(competencyResults: CompetencyResult[], enrichment: EnrichmentItem[]): GapRecord[] {
  return competencyResults
    .filter((c) => c.status !== "meets")
    .sort((a, b) => b.gap - a.gap)
    .map((c) => {
      const severity: GapSeverity =
        c.status === "not_assessed" ? "major" : severityFromGap(c.gap);
      return {
        competencyCode: c.competencyCode,
        name: c.name,
        score: c.score,
        threshold: c.threshold,
        gap: c.gap,
        severity,
        recommendations: recommendEnrichment(c.competencyCode, enrichment),
      };
    });
}

function recommendEnrichment(competencyCode: string, enrichment: EnrichmentItem[]) {
  const items = enrichment.filter((e) => e.competencyCode === competencyCode);
  const rank = { project: 0, lab: 1, course: 2, reading: 3, mentorship: 4 } as Record<string, number>;
  return items
    .sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9))
    .slice(0, 3)
    .map((e) => ({ enrichmentId: e.id, title: e.title, type: e.type, durationHrs: e.durationHrs }));
}
