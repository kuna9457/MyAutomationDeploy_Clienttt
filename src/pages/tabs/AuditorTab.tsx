import { useEffect, useState } from "react"
import AuditReportView from "../../components/AuditReport"
import { api, ApiError } from "../../lib/api"
import type {
  AuditPreview,
  AuditProviderInfo,
  AuditReport,
} from "../../lib/types"

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export default function AuditorTab() {
  const [environment, setEnvironment] = useState<"Live" | "Paper">("Live")
  const [start, setStart] = useState(isoDaysAgo(90))
  const [end, setEnd] = useState(isoDaysAgo(0))
  const [provs, setProvs] = useState<AuditProviderInfo[]>([])
  const [provider, setProvider] = useState("")
  const [model, setModel] = useState("")
  const [preview, setPreview] = useState<AuditPreview | null>(null)
  const [showPack, setShowPack] = useState(false)
  const [report, setReport] = useState<AuditReport | null>(null)
  const [history, setHistory] = useState<AuditReport[]>([])
  const [busy, setBusy] = useState<"" | "preview" | "run">("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<AuditProviderInfo[]>("/auditor/providers")
      .then((list) => {
        setProvs(list)
        const first = list.find((p) => p.available)
        if (first) {
          setProvider(first.name)
          setModel(first.model)
        }
      })
      .catch(() => {})
    refreshHistory()
  }, [])

  const refreshHistory = () =>
    api
      .get<AuditReport[]>("/auditor/reports")
      .then(setHistory)
      .catch(() => setHistory([]))

  const body = { environment, start, end, provider, model }

  const doPreview = async () => {
    setBusy("preview")
    setError(null)
    try {
      setPreview(await api.post<AuditPreview>("/auditor/preview", body))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Preview failed.")
    } finally {
      setBusy("")
    }
  }

  const doRun = async () => {
    setBusy("run")
    setError(null)
    try {
      const doc = await api.post<AuditReport>("/auditor/run", body)
      setReport(doc)
      refreshHistory()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Audit failed.")
    } finally {
      setBusy("")
    }
  }

  const open = async (id: string) => {
    try {
      setReport(await api.get<AuditReport>(`/auditor/reports/${id}`))
    } catch {
      /* ignore */
    }
  }

  const remove = async (id: string) => {
    await api.del(`/auditor/reports/${id}`)
    if (report?.id === id) setReport(null)
    refreshHistory()
  }

  const anyProvider = provs.some((p) => p.available)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">🧠 AI Auditor</h2>
        <p className="mt-1 text-xs text-slate-400">
          An outside review of how the bot has actually traded. It reads closed
          trades and your current settings, and returns a blunt assessment plus
          specific changes to consider.{" "}
          <span className="text-slate-300">
            It cannot place orders and cannot change any setting — every
            recommendation is applied by you, by hand.
          </span>
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-xs text-slate-400">
            Environment
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as "Live" | "Paper")}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            >
              <option value="Live">Live</option>
              <option value="Paper">Paper</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">
            From
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            To
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Provider
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value)
                const p = provs.find((x) => x.name === e.target.value)
                if (p) setModel(p.model)
              }}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            >
              {provs.map((p) => (
                <option key={p.name} value={p.name} disabled={!p.available}>
                  {p.name}
                  {!p.available && " (no API key)"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-2 block text-xs text-slate-400">
          Model
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="provider default"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={doPreview}
            disabled={busy !== ""}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            {busy === "preview" ? "Building…" : "🔍 Preview payload (free)"}
          </button>
          <button
            onClick={doRun}
            disabled={busy !== "" || !anyProvider}
            className="rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            {busy === "run" ? "Auditing…" : "🧠 Run audit (calls the API)"}
          </button>
          {preview && (
            <span className="text-[11px] text-slate-400">
              {preview.closed_trades} closed trades ·{" "}
              {(preview.bytes / 1024).toFixed(1)} KB payload
              <button
                onClick={() => setShowPack((v) => !v)}
                className="ml-2 text-sky-400 hover:underline"
              >
                {showPack ? "hide" : "inspect"}
              </button>
            </span>
          )}
        </div>

        {!anyProvider && (
          <p className="mt-2 text-[11px] text-amber-400">
            No API key configured. Add OPENROUTER_API_KEY or GEMINI_API_KEY to
            backend/.env and restart the server. Preview works without a key.
          </p>
        )}
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {showPack && preview && (
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <p className="mb-1 text-[11px] text-slate-500">
            This is exactly what would be sent — nothing else leaves your
            machine. No credentials, no account identifiers.
          </p>
          <pre className="max-h-96 overflow-auto text-[10px] leading-relaxed text-slate-300">
            {JSON.stringify(preview.pack, null, 2)}
          </pre>
        </div>
      )}

      {report && <AuditReportView doc={report} />}

      {history.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">
            Past audits
          </h3>
          <div className="space-y-1">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/40 px-2 py-1"
              >
                <button
                  onClick={() => open(h.id)}
                  className="flex-1 text-left text-[11px] text-slate-300 hover:text-slate-100"
                >
                  <span className="font-semibold">{h.verdict || "—"}</span> ·{" "}
                  {h.created_at?.slice(0, 16).replace("T", " ")} · {h.environment}{" "}
                  · {h.closed_trades} trades · {h.provider}/{h.model}
                </button>
                <button
                  onClick={() => remove(h.id)}
                  className="rounded px-1 text-[11px] text-slate-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
