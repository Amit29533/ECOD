"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ContentEditor({ collection, records }: { collection: string; records: unknown[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(JSON.stringify(records, null, 2));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

  async function save() {
    setBusy(true);
    setStatus(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setStatus({ tone: "err", msg: `Invalid JSON: ${(e as Error).message}` });
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/content/${collection}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: parsed }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setStatus({ tone: "err", msg: data.error ?? "Save failed." });
      return;
    }
    setStatus({ tone: "ok", msg: `Saved ${data.count} records. New assessments use this content immediately.` });
    router.refresh();
  }

  const lineCount = draft.split("\n").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {records.length} records · editing raw JSON (schema documented in <code>docs/domain-content-guide.md</code>)
        </p>
        <div className="flex items-center gap-3">
          {status && (
            <span className={`text-xs font-semibold ${status.tone === "ok" ? "text-emerald-600" : "text-rose-600"}`}>{status.msg}</span>
          )}
          <button className="btn-primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Validate & save"}
          </button>
        </div>
      </div>
      <textarea
        className="input min-h-[28rem] font-mono text-xs leading-relaxed"
        style={{ lineHeight: 1.6 }}
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={`${collection} JSON`}
      />
      <p className="text-[11px] text-slate-400">{lineCount} lines · Ctrl/Cmd-F works inside the editor</p>
    </div>
  );
}
