import { useCallback, useEffect, useRef, useState } from "react"
import Brand from "../components/Brand"
import { BASE_URL } from "../lib/api"
import { useAuth } from "../lib/auth"
import { ThemeToggle } from "../lib/theme"

/**
 * Where a broker sends the user back after they log in.
 *
 * The broker appends the one-time authorization value to this URL —
 * `?code=` for Upstox, `?request_token=` for Zerodha — and this page trades
 * it for a real access token automatically. It replaces the previous flow,
 * where the user had to copy the whole redirected URL out of the address bar
 * and paste it into the Broker panel by hand.
 *
 * Three things this page is careful about:
 *
 *  - It lives OUTSIDE RequireAuth. A redirect to /login would drop the query
 *    string, destroying the one-time value the user just earned. So the page
 *    renders regardless and decides what to do itself.
 *  - It captures the value into state on FIRST render, before anything can
 *    navigate, and never re-reads the URL afterwards.
 *  - It talks to the exchange endpoint with a plain fetch rather than the
 *    shared api client, because that client redirects to /login on a 401 —
 *    which here would throw away the value instead of letting the user
 *    recover it manually.
 *
 * The manual paste path in the Broker panel still works and is shown as a
 * fallback whenever the automatic exchange can't complete.
 */

type Phase = "working" | "done" | "failed" | "needs-login" | "no-code"

function readAuthValue(): { broker: "Upstox" | "Zerodha"; value: string } | null {
  const params = new URLSearchParams(window.location.search)
  const code = params.get("code")
  if (code) return { broker: "Upstox", value: code }
  const requestToken = params.get("request_token")
  if (requestToken) return { broker: "Zerodha", value: requestToken }
  return null
}

export default function BrokerCallbackPage() {
  const { isAuthenticated } = useAuth()
  // Captured once, on the very first render, so nothing that happens later
  // can lose it.
  const [auth] = useState(readAuthValue)
  const [phase, setPhase] = useState<Phase>("working")
  const [message, setMessage] = useState("")
  const started = useRef(false)

  const exchange = useCallback(async () => {
    if (!auth) return
    const path = auth.broker === "Upstox" ? "upstox" : "zerodha"
    const bodyKey = auth.broker === "Upstox" ? "code" : "request_token"
    setPhase("working")
    try {
      const res = await fetch(`${BASE_URL}/broker/${path}/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
        },
        body: JSON.stringify({ [bodyKey]: auth.value }),
      })
      if (res.status === 401) {
        setPhase("needs-login")
        return
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPhase("failed")
        setMessage(body.detail || `${auth.broker} rejected the login.`)
        return
      }
      setPhase("done")
      setMessage(body.message || `${auth.broker} connected.`)
    } catch {
      setPhase("failed")
      setMessage("Couldn't reach the server. Check your connection and retry.")
    }
  }, [auth])

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!auth) {
      setPhase("no-code")
      return
    }
    if (!isAuthenticated) {
      setPhase("needs-login")
      return
    }
    void exchange()
  }, [auth, isAuthenticated, exchange])

  const card =
    "w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8"

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className={card}>
        <div className="mb-1 flex items-start justify-between gap-2">
          <Brand size="lg" />
          <ThemeToggle />
        </div>
        <p className="mb-6 text-sm text-slate-400">
          {auth ? `Connecting your ${auth.broker} account` : "Broker connection"}
        </p>

        {phase === "working" && (
          <p className="text-sm text-slate-300">⏳ Connecting…</p>
        )}

        {phase === "done" && (
          <>
            <div className="mb-4 rounded-lg bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
              ✅ {message}
            </div>
            <p className="mb-4 text-xs text-slate-500">
              You can close this tab — your dashboard is already updated.
              {auth?.broker === "Zerodha" &&
                " Note that Zerodha sessions expire each morning, so you'll" +
                  " reconnect once a day."}
            </p>
            <a
              href="/"
              className="block w-full rounded-lg bg-indigo-600 px-4 py-2 text-center font-medium text-white hover:bg-indigo-500"
            >
              Go to dashboard
            </a>
          </>
        )}

        {phase === "needs-login" && (
          <>
            <div className="mb-3 rounded-lg bg-amber-950 px-3 py-2 text-sm text-amber-300">
              You're signed out, so we couldn't finish automatically.
            </div>
            <p className="mb-3 text-xs text-slate-400">
              Your broker code is still valid — sign in, then paste this into
              the <strong>Connect {auth?.broker}</strong> panel:
            </p>
            <CopyBox value={auth?.value ?? ""} />
            <a
              href="/login"
              className="mt-3 block w-full rounded-lg bg-indigo-600 px-4 py-2 text-center font-medium text-white hover:bg-indigo-500"
            >
              Sign in
            </a>
          </>
        )}

        {phase === "failed" && (
          <>
            <div className="mb-3 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">
              {message}
            </div>
            <p className="mb-3 text-xs text-slate-400">
              You can retry, or paste this code into the{" "}
              <strong>Connect {auth?.broker}</strong> panel yourself:
            </p>
            <CopyBox value={auth?.value ?? ""} />
            <button
              onClick={() => void exchange()}
              className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500"
            >
              Retry
            </button>
            <a
              href="/"
              className="mt-2 block w-full rounded-lg px-4 py-2 text-center text-sm text-slate-400 hover:text-slate-200"
            >
              Back to dashboard
            </a>
          </>
        )}

        {phase === "no-code" && (
          <>
            <div className="mb-3 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300">
              No broker code in this link.
            </div>
            <p className="mb-4 text-xs text-slate-500">
              This page is where your broker sends you after logging in. Open
              it from the <strong>Connect</strong> panel on your dashboard
              rather than directly.
            </p>
            <a
              href="/"
              className="block w-full rounded-lg bg-indigo-600 px-4 py-2 text-center font-medium text-white hover:bg-indigo-500"
            >
              Go to dashboard
            </a>
          </>
        )}
      </div>
    </div>
  )
}

/** The raw one-time value, selectable and copyable — the escape hatch that
 *  means a failed auto-exchange never costs the user their login. */
function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-100"
      />
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="shrink-0 rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-600"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}
