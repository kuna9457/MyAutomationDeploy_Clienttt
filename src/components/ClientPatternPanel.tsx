import { useEffect, useMemo, useState } from "react"
import { api, ApiError } from "../lib/api"

interface MyPatterns {
  available: boolean
  catalogue: string[]
  enabled: boolean
  allowed: string[]
}

/** The client's own candlestick-pattern choice (backend client_patterns.py).
 *
 *  Same idea as the admin's pattern filter, applied to THIS account only: the
 *  bot takes a signal only if at least one pattern behind it is ticked here.
 *  Off, or on with nothing ticked, means every signal is taken as before. It
 *  can only make the bot trade less — never changes position size.
 *
 *  Hidden unless the run the admin set up is a candlestick strategy, since
 *  that is the only kind of signal it can affect.
 */
export default function ClientPatternPanel() {
  const [data, setData] = useState<MyPatterns | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<MyPatterns>("/config/my-patterns").then(setData).catch(() => {})
  }, [])

  const shown = useMemo(() => {
    const list = data?.catalogue ?? []
    const q = query.trim().toLowerCase()
    return q ? list.filter((p) => p.toLowerCase().includes(q)) : list
  }, [data, query])

  if (!data || !data.available) return null

  const save = async (enabled: boolean, allowed: string[]) => {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const next = await api.put<MyPatterns>("/config/my-patterns", { enabled, allowed })
      setData(next)
      setMsg(
        next.enabled && next.allowed.length
          ? `Saved — your bot only takes signals from ${next.allowed.length} pattern(s).`
          : "Saved. Filter is OFF — your bot takes every signal.",
      )
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.")
    } finally {
      setBusy(false)
    }
  }

  const toggle = (p: string) =>
    save(
      data.enabled,
      data.allowed.includes(p) ? data.allowed.filter((x) => x !== p) : [...data.allowed, p],
    )

  const active = data.enabled && data.allowed.length > 0

  return (
    <section className="rounded-lg border border-slate-800 p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-medium text-slate-300">🕯️ Candlestick patterns</span>
        <span className="text-[11px] text-slate-500">
          {active ? `${data.allowed.length} selected` : "all"} {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <label className="flex items-start gap-2 text-slate-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={data.enabled}
              disabled={busy}
              onChange={(e) => save(e.target.checked, data.allowed)}
            />
            <span className="text-xs">
              Only trade the ticked patterns
              <span className="block text-[11px] text-slate-500">
                Off by default. Your bot takes a signal only if at least one
                pattern behind it is ticked. It can only make your bot trade
                LESS — never changes position size. Applies from the next
                signal, even while the bot is running.
              </span>
            </span>
          </label>

          {data.enabled && data.allowed.length === 0 && (
            <p className="rounded border border-amber-800 bg-amber-950/40 p-2 text-[11px] text-amber-300">
              Nothing ticked yet, so the filter is still OFF and every signal is
              taken. Tick at least one pattern to make it apply.
            </p>
          )}

          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patterns…"
              className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            />
            <button
              onClick={() => save(data.enabled, [])}
              disabled={busy || data.allowed.length === 0}
              className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 disabled:opacity-40"
            >
              clear
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto rounded border border-slate-800">
            {shown.map((p) => {
              const on = data.allowed.includes(p)
              return (
                <label
                  key={p}
                  className={`flex items-center gap-2 border-b border-slate-900 px-2 py-1 last:border-0 ${
                    on ? "bg-sky-950/40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busy}
                    onChange={() => toggle(p)}
                  />
                  <span className="flex-1 text-[11px] text-slate-200">{p}</span>
                </label>
              )
            })}
            {shown.length === 0 && (
              <p className="px-2 py-2 text-[11px] text-slate-500">No match.</p>
            )}
          </div>

          {active && (
            <p className="text-[11px] text-emerald-400">
              ✅ Active: {data.allowed.length} pattern(s) may open a trade for you.
            </p>
          )}
          {msg && <p className="text-[11px] text-slate-400">{msg}</p>}
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
      )}
    </section>
  )
}
