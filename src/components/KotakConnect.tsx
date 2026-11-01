import { useEffect, useState } from "react"
import { api, ApiError, apiBase } from "../lib/api"

/** Kotak Neo setup + daily login, for the admin AND a client.
 *
 *  Kotak has no OAuth redirect. Instead:
 *    1. once: save the Neo consumer key, registered mobile and UCC;
 *    2. each trading day: type the 6-digit TOTP from your authenticator app
 *       and your MPIN — the server opens the session with them.
 *
 *  The TOTP and MPIN are sent for that one login call and never stored, so
 *  they are cleared from the form the moment it returns. The server decides
 *  WHERE the setup lives (a client's encrypted record, or the admin's .env);
 *  this component is identical for both. */

interface KotakSetup {
  configured: boolean
  consumer_key_masked: string
  mobile_masked: string
  ucc_masked: string
  has_session: boolean
  session_issued_at: string
  sdk_installed: boolean
}
interface TokenStatus {
  has_token: boolean
  valid?: boolean
  detail?: string
}

const input =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"

export default function KotakConnect({
  asClient = false,
  onConnected,
}: {
  /** Client wording ("your account") and a Remove button that wipes the setup. */
  asClient?: boolean
  onConnected?: () => void
}) {
  const [setup, setSetup] = useState<KotakSetup | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<TokenStatus | null>(null)
  const [editing, setEditing] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [consumerKey, setConsumerKey] = useState("")
  const [mobile, setMobile] = useState("")
  const [ucc, setUcc] = useState("")
  const [totp, setTotp] = useState("")
  const [mpin, setMpin] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const refresh = () => {
    api
      .get<KotakSetup>("/broker/kotak/setup")
      .then((s) => {
        setSetup(s)
        setLoadError(null)
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load."))
    api.get<TokenStatus>("/broker/kotak/token-status").then(setStatus).catch(() => {})
  }

  useEffect(refresh, [])

  const fail = (err: unknown, fallback: string) =>
    setMsg({ kind: "err", text: err instanceof ApiError ? err.message : fallback })

  const saveSetup = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.put<KotakSetup>("/broker/kotak/setup", {
        consumer_key: consumerKey.trim(),
        mobile: mobile.trim(),
        ucc: ucc.trim(),
      })
      setSetup(res)
      setConsumerKey("")
      setMobile("")
      setUcc("")
      setEditing(false)
      setStatus({ has_token: false })
      setMsg({ kind: "ok", text: "Saved. Now log in with your TOTP and MPIN." })
    } catch (err) {
      fail(err, "Could not save.")
    } finally {
      setBusy(false)
    }
  }

  const login = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.post<{ ok: boolean; message: string }>("/broker/kotak/login", {
        totp: totp.trim(),
        mpin: mpin.trim(),
      })
      setMsg({ kind: "ok", text: res.message })
      refresh()
      onConnected?.()
    } catch (err) {
      fail(err, "Login failed.")
    } finally {
      // Never keep either factor around, success or not.
      setTotp("")
      setMpin("")
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.del<KotakSetup>("/broker/kotak/setup")
      setSetup(res)
      setStatus({ has_token: false })
      setMsg({ kind: "ok", text: asClient ? "Removed." : "Logged out." })
    } catch (err) {
      fail(err, "Could not remove.")
    } finally {
      setBusy(false)
    }
  }

  const configured = !!setup?.configured
  const showSetupForm = editing || !configured
  const live = !!(status?.has_token && status.valid)

  return (
    <details
      className="rounded-lg border border-slate-800 p-3"
      open={asClient || !live}
    >
      <summary className="cursor-pointer text-sm font-medium text-slate-300">
        🔑 Kotak Neo {live ? "✓" : ""}
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex items-center justify-between">
          {status?.has_token ? (
            <p className="text-xs text-slate-400">
              {status.valid ? "Connected ✓" : "⚠️ Session expired"} — {status.detail}
            </p>
          ) : (
            <p className="text-xs text-slate-500">Not logged in today.</p>
          )}
          <button
            type="button"
            onClick={() => setShowHelp((s) => !s)}
            className="shrink-0 text-[11px] text-indigo-400 hover:text-indigo-300"
          >
            {showHelp ? "Hide help" : "Help"}
          </button>
        </div>

        {showHelp && (
          <ol className="list-decimal space-y-1 rounded border border-slate-800 bg-slate-950/60 p-2 pl-5 text-[11px] text-slate-400">
            <li>
              Neo app or web → <b>More</b> → <b>Trade API</b> → create an application and
              copy its token. That is your <b>consumer key</b>.
            </li>
            <li>
              On the same Trade API page, choose <b>TOTP Registration</b> and scan the QR
              code with Google Authenticator or Authy.
            </li>
            <li>
              Your <b>UCC</b> (client code) is under Profile in the Neo app.
            </li>
            <li>
              Each trading day, log in below with the current 6-digit TOTP and your MPIN.
              Neither is saved — the session lasts for the day.
            </li>
            <li>Only NSE cash stocks (intraday, MIS) trade through Kotak here; MCX is not supported yet.</li>
          </ol>
        )}

        {setup && !setup.sdk_installed && (
          <p className="rounded border border-amber-900/60 bg-amber-950/30 p-2 text-[11px] text-amber-400">
            ⚠️ The Kotak SDK isn't installed on this server. Run{" "}
            <code>pip install kotakneoapi</code> and restart the backend.
          </p>
        )}

        {loadError && (
          <p className="text-xs text-amber-400">
            {loadError}
            <span className="mt-0.5 block text-[11px] text-slate-500">Server: {apiBase()}</span>
          </p>
        )}

        {configured && !editing && (
          <div className="text-xs text-slate-400">
            Key <code className="text-slate-300">{setup!.consumer_key_masked}</code> · Mobile{" "}
            <code className="text-slate-300">{setup!.mobile_masked}</code> · UCC{" "}
            <code className="text-slate-300">{setup!.ucc_masked}</code>
            <div className="mt-1 flex gap-3">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300"
              >
                Change
              </button>
              {(asClient || status?.has_token) && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="text-[11px] text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  {asClient ? "Remove" : "Log out"}
                </button>
              )}
            </div>
          </div>
        )}

        {showSetupForm && setup && (
          <div className="space-y-1.5">
            <input
              className={input}
              placeholder="Consumer key (Neo → More → Trade API)"
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
              autoComplete="off"
            />
            <input
              className={input}
              placeholder="Registered mobile (10 digits)"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              inputMode="tel"
              autoComplete="off"
            />
            <input
              className={input}
              placeholder="UCC (client code)"
              value={ucc}
              onChange={(e) => setUcc(e.target.value)}
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button
                onClick={saveSetup}
                disabled={busy || !consumerKey || !mobile || !ucc}
                className="flex-1 rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-600 disabled:opacity-50"
              >
                💾 Save setup
              </button>
              {editing && (
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-lg px-2 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {configured && !editing && (
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              login()
            }}
          >
            <div className="flex gap-2">
              <input
                className={input}
                placeholder="TOTP (6 digits)"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <input
                className={input}
                type="password"
                placeholder="MPIN"
                value={mpin}
                onChange={(e) => setMpin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              disabled={busy || totp.length !== 6 || mpin.length < 4}
              className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Logging in…" : live ? "Log in again" : "Log in to Kotak Neo"}
            </button>
          </form>
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
