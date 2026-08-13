import { useState } from "react"
import type { AuditReport as Report } from "../lib/types"

const VERDICT: Record<string, { label: string; cls: string }> = {
  PROFITABLE: { label: "PROFITABLE", cls: "bg-emerald-950 text-emerald-300 border-emerald-800" },
  MARGINAL: { label: "MARGINAL", cls: "bg-amber-950 text-amber-300 border-amber-800" },
  LOSING: { label: "LOSING", cls: "bg-red-950 text-red-300 border-red-800" },
  INSUFFICIENT_DATA: { label: "INSUFFICIENT DATA", cls: "bg-slate-800 text-slate-300 border-slate-700" },
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="mt-1">
      <span className="text-[11px] text-slate-500">{label}: </span>
      <span className="text-[11px] text-slate-300">{value}</span>
    </div>
  )
}

export default function AuditReportView({ doc }: { doc: Report }) {
  const [copied, setCopied] = useState<string | null>(null)
  const r = doc.report
  if (!r) {
    return <p className="text-xs text-red-400">{doc.error || "Empty report."}</p>
  }
  const v = VERDICT[r.verdict] ?? VERDICT.INSUFFICIENT_DATA

  const copy = (rec: (typeof r.recommendations)[number]) => {
    // Copy, never apply. An auditor that can change settings is no longer an
    // auditor — the operator evaluates and applies by hand.
    void navigator.clipboard?.writeText(
      `${rec.lever} (${rec.scope}): ${rec.current} -> ${rec.proposed}`,
    )
    setCopied(rec.lever + rec.scope)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded border px-2 py-0.5 text-xs font-bold ${v.cls}`}>
            {v.label}
          </span>
          <span className="text-[11px] text-slate-500">
            {doc.environment} · {doc.closed_trades} closed trades ·{" "}
            {doc.window.from} → {doc.window.to} · {doc.provider}/{doc.model}
          </span>
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-100">{r.headline}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          Confidence: <span className="font-semibold">{r.confidence}</span> —{" "}
          {r.confidence_reason}
        </p>

        {doc.fell_back && (
          <p className="mt-2 rounded border border-sky-900 bg-sky-950/40 p-2 text-[11px] text-sky-300">
            ↪ Fell back to <span className="font-semibold">{doc.provider}</span>.
            {(doc.attempts ?? [])
              .filter((a) => !a.ok)
              .map((a, i) => (
                <span key={i} className="block text-slate-400">
                  {a.provider} failed: {a.error}
                </span>
              ))}
          </p>
        )}

        {(doc.unverified_numbers?.length ?? 0) > 0 && (
          <p className="mt-2 rounded border border-amber-800 bg-amber-950/40 p-2 text-[11px] text-amber-300">
            ⚠️ These figures do not appear in the data the model was given:{" "}
            <span className="font-mono">{doc.unverified_numbers!.join(", ")}</span>.
            The model was told to quote numbers only — treat these as unreliable.
          </p>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <h4 className="mb-1 text-xs font-semibold text-emerald-400">
            ✅ What is working
          </h4>
          {r.what_is_working.length === 0 ? (
            <p className="text-[11px] text-slate-500">Nothing identified.</p>
          ) : (
            <ul className="space-y-2">
              {r.what_is_working.map((f, i) => (
                <li key={i} className="text-xs text-slate-200">
                  {f.claim}
                  <span className="block text-[11px] text-slate-500">
                    {f.evidence} · n={f.sample}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <h4 className="mb-1 text-xs font-semibold text-red-400">
            ❌ What is broken
          </h4>
          {r.what_is_broken.length === 0 ? (
            <p className="text-[11px] text-slate-500">Nothing identified.</p>
          ) : (
            <ul className="space-y-2">
              {r.what_is_broken.map((f, i) => (
                <li key={i} className="text-xs text-slate-200">
                  {f.claim}
                  <span className="block text-[11px] text-slate-500">
                    {f.evidence} · n={f.sample}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold text-slate-200">
          🔧 Recommendations ({r.recommendations.length})
        </h4>
        <div className="space-y-2">
          {[...r.recommendations]
            .sort((a, b) => a.priority - b.priority)
            .map((rec, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-700 bg-slate-900/60 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100">
                    #{rec.priority} · {rec.lever}
                    <span className="ml-1 font-normal text-slate-500">
                      ({rec.scope})
                    </span>
                  </span>
                  <button
                    onClick={() => copy(rec)}
                    className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700"
                  >
                    {copied === rec.lever + rec.scope ? "copied ✓" : "copy setting"}
                  </button>
                </div>
                <p className="mt-1 font-mono text-[11px] text-sky-300">
                  {rec.current} → {rec.proposed}
                </p>
                <p className="mt-1 text-xs text-slate-300">{rec.rationale}</p>
                <Field label="Evidence" value={rec.evidence} />
                <Field label="Expected effect" value={rec.expected_effect} />
                <Field label="Risk of changing" value={rec.risk_of_change} />
                <Field label="Verify by" value={rec.how_to_verify} />
              </div>
            ))}
          {r.recommendations.length === 0 && (
            <p className="text-[11px] text-slate-500">No changes proposed.</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <h4 className="mb-1 text-xs font-semibold text-slate-200">
            🛑 Leave alone
          </h4>
          {r.do_not_change.length === 0 ? (
            <p className="text-[11px] text-slate-500">Nothing listed.</p>
          ) : (
            <ul className="space-y-1">
              {r.do_not_change.map((d, i) => (
                <li key={i} className="text-xs text-slate-300">
                  <span className="font-semibold">{d.item}</span> — {d.why}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <h4 className="mb-1 text-xs font-semibold text-slate-200">
            📋 Data gaps
          </h4>
          {r.data_gaps.length === 0 ? (
            <p className="text-[11px] text-slate-500">None listed.</p>
          ) : (
            <ul className="space-y-1">
              {r.data_gaps.map((g, i) => (
                <li key={i} className="text-xs text-slate-300">• {g}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        This is advice, not an instruction. Nothing here has been applied, and
        the auditor cannot apply anything. Verify a recommendation in the
        Backtest tab before changing a live setting.
      </p>
    </div>
  )
}
