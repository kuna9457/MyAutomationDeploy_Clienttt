import { useEffect, useState } from "react"
import { api, ApiError } from "../lib/api"

interface TokenStatus {
  has_token: boolean
  valid?: boolean
  detail?: string
}

function extractCode(input: string): string {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed)
    return url.searchParams.get("code") || url.searchParams.get("request_token") || trimmed
  } catch {
    return trimmed
  }
}

export default function ClientBrokerConnect({
  broker,
  onConnected,
}: {
  broker: "Upstox" | "Zerodha"
  onConnected: () => void
}) {
  const [status, setStatus] = useState<TokenStatus | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [pasted, setPasted] = useState("")
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [needsCredentials, setNeedsCredentials] = useState(false)

  const path = broker === "Upstox" ? "upstox" : "zerodha"
  const bodyKey = broker === "Upstox" ? "code" : "request_token"

  const refresh = () => {
    api.get<TokenStatus>(`/broker/${path}/token-status`).then(setStatus).catch(() => {})
    // 400 here means "no API key saved yet" — the credentials panel above is
    // the next step, so surface that rather than an empty panel.
    api
      .get<{ login_url: string }>(`/broker/${path}/login-url`)
      .then((r) => {
        setLoginUrl(r.login_url)
        setNeedsCredentials(false)
      })
      .catch(() => {
        setLoginUrl(null)
        setNeedsCredentials(true)
      })
  }

  useEffect(refresh, [broker])

  const connect = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.post<{ ok: boolean; message: string }>(
        `/broker/${path}/exchange`,
        { [bodyKey]: extractCode(pasted) },
      )
      setMsg({ kind: "ok", text: res.message })
      setPasted("")
      refresh()
      onConnected()
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Connect failed." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-800 p-3">
      <div className="text-sm font-medium text-slate-300">Connect {broker}</div>
      {status?.has_token ? (
        <p className={`text-xs ${status.valid ? "text-slate-400" : "text-amber-400"}`}>
          {status.valid
            ? `✅ Connected — ${status.detail}`
            : "⚠️ Session expired — log in again below to reconnect."}
        </p>
      ) : needsCredentials ? (
        <p className="text-xs text-slate-500">
          Save your {broker} API key and secret above first.
        </p>
      ) : (
        <p className="text-xs text-slate-500">Not connected yet.</p>
      )}
      {loginUrl && (
        <>
          <a
            href={loginUrl}
            target="_blank"
            rel="noreferrer"
            className="block w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-indigo-500"
          >
            Log in at {broker} ↗
          </a>
          <p className="text-[11px] text-slate-500">
            You'll be sent back here automatically once you've logged in — no
            copying needed.
          </p>
          {/* The manual path is kept, but demoted: it is now the recovery
              route for when the redirect can't complete (a mis-registered
              Redirect URL, or an expired session on the callback tab), not
              the normal flow. */}
          <details className="text-[11px] text-slate-500">
            <summary className="cursor-pointer hover:text-slate-300">
              Didn't come back automatically?
            </summary>
            <p className="mt-1 mb-1">
              Paste the full URL you landed on, or just the code from it.
            </p>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
              placeholder="Paste the redirected URL or code"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <button
              onClick={connect}
              disabled={busy || !pasted}
              className="mt-1 w-full rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-50"
            >
              Connect
            </button>
          </details>
        </>
      )}
      {msg && (
        <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
