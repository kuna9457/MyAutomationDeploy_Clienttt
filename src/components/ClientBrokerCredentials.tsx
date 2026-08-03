import { useEffect, useState } from "react"
import { api, ApiError } from "../lib/api"
import type { BrokerCredentialSummary, BrokerOnboardingInfo } from "../lib/types"

/** A client's own broker app credentials.
 *
 *  The secret is write-only by design: the server has no endpoint that returns
 *  it, so nothing here ever re-populates a saved value into an input. What
 *  comes back is a masked key and status flags. */
export default function ClientBrokerCredentials({
  broker,
  onSaved,
}: {
  broker: "Upstox" | "Zerodha"
  onSaved: () => void
}) {
  const [summary, setSummary] = useState<BrokerCredentialSummary | null>(null)
  const [info, setInfo] = useState<BrokerOnboardingInfo | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [reveal, setReveal] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const refresh = () => {
    api
      .get<BrokerCredentialSummary>(`/broker/${broker}/credentials`)
      .then(setSummary)
      .catch(() => setSummary(null))
  }

  useEffect(() => {
    refresh()
    setEditing(false)
    setApiKey("")
    setApiSecret("")
    setMsg(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broker])

  useEffect(() => {
    api.get<BrokerOnboardingInfo>("/broker/onboarding-info").then(setInfo).catch(() => {})
  }, [])

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.put<BrokerCredentialSummary>(
        `/broker/${broker}/credentials`,
        { api_key: apiKey.trim(), api_secret: apiSecret.trim() },
      )
      setSummary(res)
      setApiKey("")
      setApiSecret("")
      setEditing(false)
      setReveal(false)
      setMsg({ kind: "ok", text: "Saved. Now log in at your broker below." })
      onSaved()
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Could not save." })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.del<BrokerCredentialSummary>(`/broker/${broker}/credentials`)
      setSummary(res)
      setMsg({ kind: "ok", text: "Removed." })
      onSaved()
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Could not remove." })
    } finally {
      setBusy(false)
    }
  }

  const configured = !!summary?.configured
  const showForm = editing || !configured
  const brokerInfo = info?.brokers.find((b) => b.key === broker)

  return (
    <div className="space-y-2 rounded-lg border border-slate-800 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">{broker} API Credentials</span>
        <button
          type="button"
          onClick={() => setShowHelp((s) => !s)}
          className="text-[11px] text-indigo-400 hover:text-indigo-300"
        >
          {showHelp ? "Hide help" : "How do I get these?"}
        </button>
      </div>

      {showHelp && (
        <div className="space-y-1 rounded border border-slate-800 bg-slate-950/60 p-2 text-[11px] text-slate-400">
          <p>{brokerInfo?.note}</p>
          {brokerInfo?.console_url && (
            <a
              href={brokerInfo.console_url}
              target="_blank"
              rel="noreferrer"
              className="block text-indigo-400 hover:text-indigo-300"
            >
              Open {broker} developer console ↗
            </a>
          )}
          {info?.redirect_uri && (
            <div>
              <div className="mt-1 text-slate-500">Register this Redirect URI exactly:</div>
              <div className="flex items-center gap-1">
                <code className="block flex-1 overflow-x-auto rounded bg-slate-900 px-1.5 py-1 text-slate-300">
                  {info.redirect_uri}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(info.redirect_uri)}
                  className="rounded bg-slate-700 px-1.5 py-1 text-slate-200 hover:bg-slate-600"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
          <p className="text-slate-500">
            Your key and secret are encrypted before storage and are never shown
            again — not even to your admin.
          </p>
        </div>
      )}

      {info && !info.vault_ready && (
        <p className="rounded border border-amber-900/60 bg-amber-950/30 p-2 text-[11px] text-amber-400">
          ⚠️ The server can't store credentials securely yet (CREDENTIALS_KEY not
          set). Ask your admin before entering anything.
        </p>
      )}

      {configured && !editing && (
        <div className="text-xs text-slate-400">
          <p>
            ✅ API key <code className="text-slate-300">{summary!.api_key_masked}</code> saved
            {summary!.updated_at && (
              <span className="text-slate-500">
                {" "}· {new Date(summary!.updated_at).toLocaleDateString()}
              </span>
            )}
          </p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(true)
                setApiKey("")
                setApiSecret("")
              }}
              className="rounded bg-slate-700 px-2 py-1 text-[11px] text-slate-100 hover:bg-slate-600"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded border border-red-900 px-2 py-1 text-[11px] text-red-400 hover:bg-red-950/40 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="space-y-2">
          {editing && (
            <p className="text-[11px] text-slate-500">
              Enter both values again — a saved secret can't be read back, so it
              can't be partially updated.
            </p>
          )}
          <input
            type={reveal ? "text" : "password"}
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
          />
          <input
            type={reveal ? "text" : "password"}
            autoComplete="new-password"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder="API Secret"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
          />
          <label className="flex items-center gap-2 text-[11px] text-slate-500">
            <input
              type="checkbox"
              checked={reveal}
              onChange={() => setReveal((r) => !r)}
            />
            Show what I'm typing
          </label>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy || !apiKey.trim() || !apiSecret.trim()}
              className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              💾 Save credentials
            </button>
            {editing && (
              <button
                onClick={() => {
                  setEditing(false)
                  setApiKey("")
                  setApiSecret("")
                }}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-[11px] ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
