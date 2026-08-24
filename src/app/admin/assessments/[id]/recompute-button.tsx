"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RecomputeButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        className="btn-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setNote(null);
          const res = await fetch(`/api/assessments/${assessmentId}/recompute`, { method: "POST" });
          setBusy(false);
          setNote(res.ok ? "Recomputed" : "Failed");
          router.refresh();
        }}
      >
        {busy ? "Recomputing…" : "Recompute scores"}
      </button>
      {note && <span className="text-xs text-slate-500">{note}</span>}
    </div>
  );
}
