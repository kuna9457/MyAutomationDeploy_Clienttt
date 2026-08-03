import { useEffect, useState } from "react"
import { api, ApiError } from "../lib/api"

interface UpstoxLoginUrl {
  login_url: string
  redirect_uri: string
}
interface TokenStatus {
  has_token: boolean
  valid?: boolean
  detail?: string
}
interface DhanStatus {
  configured: boolean
  valid?: boolean
  available_funds?: number | null
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

export default function BrokerLoginPanel() {
  return (
    <section className="space-y-3">
      <UpstoxPanel />
      <ZerodhaPanel />
      <DhanPanel />
    </section>
  )
}

function UpstoxPanel() {
  const [loginInfo, setLoginInfo] = useState<UpstoxLoginUrl | null>(null)
  const [status, setStatus] = useState<TokenStatus | null>(null)
  const [pasted, setPasted] = useState("")
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshStatus = () =>
    api.get<TokenStatus>("/broker/upstox/token-status").then(setStatus).catch(() => {})

  useEffect(() => {
    api.get<UpstoxLoginUrl>("/broker/upstox/login-url").then(setLoginInfo).catch(() => setLoginInfo(null))
    refreshStatus()
  }, [])

  const exchange = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.post<{ ok: boolean; message: string }>("/broker/upstox/exchange", {
        code: extractCode(pasted),
      })
      setMsg({ kind: "ok", text: res.message })
      setPasted("")
      refreshStatus()
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Exchange failed." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="rounded-lg border border-slate-800 p-3" open={!status?.has_token}>
      <summary className="cursor-pointer text-sm font-medium text-slate-300">🔑 Upstox Token</summary>
      <div className="mt-2 space-y-2">
        {status?.has_token ? (
          <p className="text-xs text-slate-400">
            {status.valid ? "Valid ✓" : "⚠️ Invalid/expired"} — {status.detail}
          </p>
        ) : (
          <p className="text-xs text-slate-500">No live token set.</p>
        )}
        {loginInfo ? (
          <>
            <a
              href={loginInfo.login_url}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded-lg bg-slate-700 px-3 py-1.5 text-center text-xs text-slate-100 hover:bg-slate-600"
            >
              1) Log in at Upstox ↗
            </a>
            <p className="text-[11px] text-slate-500">
              Redirect URI: <code>{loginInfo.redirect_uri}</code>
            </p>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
              placeholder="2) Paste the redirected URL (or just the code)"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <button
              onClick={exchange}
              disabled={busy || !pasted}
              className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              3) Exchange &amp; Save Token
            </button>
          </>
        ) : (
          <p className="text-xs text-amber-400">
            Add UPSTOX_LIVE_API_KEY / UPSTOX_LIVE_SECRET to .env to refresh from here.
          </p>
        )}
        {msg && (
          <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </details>
  )
}

function ZerodhaPanel() {
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<TokenStatus | null>(null)
  const [pasted, setPasted] = useState("")
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshStatus = () =>
    api.get<TokenStatus>("/broker/zerodha/token-status").then(setStatus).catch(() => {})

  useEffect(() => {
    api
      .get<{ login_url: string }>("/broker/zerodha/login-url")
      .then((r) => setLoginUrl(r.login_url))
      .catch(() => setLoginUrl(null))
    refreshStatus()
  }, [])

  const exchange = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.post<{ ok: boolean; message: string }>("/broker/zerodha/exchange", {
        request_token: extractCode(pasted),
      })
      setMsg({ kind: "ok", text: res.message })
      setPasted("")
      refreshStatus()
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Exchange failed." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="rounded-lg border border-slate-800 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-300">🔑 Zerodha Token</summary>
      <div className="mt-2 space-y-2">
        {status?.has_token ? (
          <p className="text-xs text-slate-400">
            {status.valid ? "Valid ✓" : "⚠️ Invalid/expired"} — {status.detail}
          </p>
        ) : (
          <p className="text-xs text-slate-500">No Zerodha token set.</p>
        )}
        {loginUrl ? (
          <>
            <a
              href={loginUrl}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded-lg bg-slate-700 px-3 py-1.5 text-center text-xs text-slate-100 hover:bg-slate-600"
            >
              1) Log in at Zerodha ↗
            </a>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
              placeholder="2) Paste the redirected URL (or just the request_token)"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <button
              onClick={exchange}
              disabled={busy || !pasted}
              className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              3) Exchange &amp; Save Token
            </button>
          </>
        ) : (
          <p className="text-xs text-amber-400">
            Add ZERODHA_API_KEY / ZERODHA_API_SECRET to .env to refresh from here.
          </p>
        )}
        {msg && (
          <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </details>
  )
}

function DhanPanel() {
  const [status, setStatus] = useState<DhanStatus | null>(null)

  useEffect(() => {
    api.get<DhanStatus>("/broker/dhan/status").then(setStatus).catch(() => {})
  }, [])

  return (
    <details className="rounded-lg border border-slate-800 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-300">🔑 Dhan Token</summary>
      <div className="mt-2 space-y-1">
        {status?.configured ? (
          <p className="text-xs text-slate-400">
            {status.valid ? "Valid ✓" : "⚠️ Invalid/expired"}
            {status.available_funds != null ? ` — available ₹${status.available_funds.toLocaleString("en-IN")}` : ""}
          </p>
        ) : (
          <p className="text-xs text-slate-500">DHAN_CLIENT_ID / DHAN_ACCESS_TOKEN not set in .env.</p>
        )}
        <p className="text-[11px] text-slate-500">
          Generate/renew the token from the Dhan web console and paste it into .env, then reload.
        </p>
      </div>
    </details>
  )
}
