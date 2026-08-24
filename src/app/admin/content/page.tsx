import { requireUser } from "@/lib/auth";
import { getContent } from "@/lib/services";
import type { ContentCollection } from "@/domain/types";
import { Card } from "@/components/ui";
import { ContentEditor } from "./content-editor";

const COLLECTIONS: { key: ContentCollection; title: string; description: string }[] = [
  { key: "roles", title: "Role tracks", description: "Technology roles ECOD assesses (RSA is first; add more without code changes)." },
  { key: "competencies", title: "Competency frameworks", description: "Per-role competencies with weights and required thresholds." },
  { key: "questions", title: "Question bank", description: "MCQ (auto-scored), short answers and case studies with rubrics and expected evidence." },
  { key: "blueprints", title: "Assessment blueprints", description: "Sections, question selection and section weights per assessment." },
  { key: "enrichment", title: "Enrichment catalogue", description: "Targeted learning mapped to competencies; feeds gap recommendations." },
];

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireUser("admin");
  const { tab } = await searchParams;
  const active = COLLECTIONS.find((c) => c.key === tab) ?? COLLECTIONS[0];
  const records = await getContent(active.key);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Domain content</h1>
        <p className="text-sm text-slate-500">
          Everything assessable is configurable data — no deployment needed to add a role, competency, question, weight or framework.
          Edits validate, sync to the live store, and (in file-backed mode) write back to <code className="rounded bg-slate-200 px-1 text-xs">/content</code> for git review.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {COLLECTIONS.map((c) => (
          <a
            key={c.key}
            href={`/admin/content?tab=${c.key}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              c.key === active.key ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c.title}
          </a>
        ))}
      </div>

      <Card title={active.title} subtitle={active.description}>
        <ContentEditor collection={active.key} records={records} />
      </Card>
    </div>
  );
}
