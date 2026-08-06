import { useState } from "react"
import { api, ApiError } from "../lib/api"
import type { Category, RangeResetResult } from "../lib/types"

const CATEGORIES: (Category | "All")[] = ["All", "Equity", "Commodity", "Crypto"]

/**
 * Delete trades in a date range — the scalpel next to "Reset Portfolio"'s
 * sledgehammer. Built for clearing trades punched against simulated or bad
 * data without losing the real history around them.
 *
 * Two-step by construction. "Preview" reports exactly what would go, broken
 * down by day, and deletes nothing; only then does the Delete button appear.
 * A destructive action whose scope you can only learn by performing it is not
 * one anyone should be handed, so the server defaults to a dry run and the
 * UI never sends confirm=true without having shown the count first.
 */
export default function RangeResetPanel() {
  const [env, setEnv] = useState<"Paper" | "Live">("Paper")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [category, setCategory] = useState<Category | "All">("All")
  const [preview, setPreview] = useState<RangeResetResult | null>(null)
  const [done, setDone] = useState<RangeResetResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const body = (confirm: boolean) => ({
    environment: env,
    start,
    end,
    category: category === "All" ? "" : category,
    username: "",
    confirm,
  })

  const run = async (confirm: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<RangeResetResult>(
        "/admin/trades/reset-range",
        body(confirm),
      )
      if (confirm) {
        setDone(res)
        setPreview(null)
      } else {
        setPreview(res)
        setDone(null)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed.")
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  // Any change to the scope invalidates a preview — otherwise you could
  // preview one range and delete another.
  const rescope = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPreview(null)
    setDone(null)
  }

  const field =
    "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"

  return (
    <details className="rounded-lg border border-amber-950 bg-amber-950/10 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-amber-300">
        🗓️ Delete Trades by Date Range
      </summary>
      <p className="mt-2 text-xs text-slate-400">
        Removes trades from selected dates only — useful for clearing trades
        punched against fake or simulated data while keeping the real history
        around them. Preview first; nothing is deleted until you confirm.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <label className="text-xs text-slate-400">
          Environment
          <select
            value={env}
            onChange={(e) => rescope(setEnv)(e.target.value as "Paper" | "Live")}
            className={`mt-0.5 w-full ${field}`}
          >
            <option value="Paper">Paper</option>
            <option value="Live">Live</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          From
          <input
            type="date"
            value={start}
            onChange={(e) => rescope(setStart)(e.target.value)}
            className={`mt-0.5 w-full ${field}`}
          />
        </label>
        <label className="text-xs text-slate-400">
          To
          <input
            type="date"
            value={end}
            onChange={(e) => rescope(setEnd)(e.target.value)}
            className={`mt-0.5 w-full ${field}`}
          />
        </label>
        <label className="text-xs text-slate-400">
          Category
          <select
            value={category}
            onChange={(e) => rescope(setCategory)(e.target.value as Category | "All")}
            className={`mt-0.5 w-full ${field}`}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        onClick={() => void run(false)}
        disabled={busy || !start || !end}
        className="mt-3 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-40"
      >
        🔍 Preview
      </button>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {preview && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
          {preview.matched === 0 ? (
            <p className="text-xs text-slate-400">
              No {preview.category === "All" ? "" : `${preview.category} `}trades
              found in {preview.environment} between {preview.start} and{" "}
              {preview.end}. Nothing to delete.
            </p>
          ) : (
            <>
              <p className="text-sm text-amber-300">
                <strong>{preview.matched}</strong> trade
                {preview.matched === 1 ? "" : "s"} would be permanently deleted
                from <strong>{preview.environment}</strong>
                {preview.category !== "All" && ` (${preview.category} only)`}.
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
                {Object.entries(preview.by_day).map(([day, n]) => (
                  <li key={day}>
                    {day} — {n} trade{n === 1 ? "" : "s"}
                  </li>
                ))}
              </ul>
              {preview.open_matched > 0 && (
                <p className="mt-2 text-xs text-red-400">
                  ⚠️ {preview.open_matched} of these are still OPEN. Deleting
                  them removes the bot's record while the position may still be
                  live at your broker — close them first.
                </p>
              )}
              <button
                onClick={() => void run(true)}
                disabled={busy}
                className="mt-3 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                🗑️ Delete these {preview.matched} trade
                {preview.matched === 1 ? "" : "s"} permanently
              </button>
            </>
          )}
        </div>
      )}

      {done && (
        <p className="mt-2 text-xs text-emerald-400">
          ✅ Deleted {done.removed} trade{done.removed === 1 ? "" : "s"} from{" "}
          {done.environment} ({done.start} → {done.end}
          {done.category !== "All" && `, ${done.category}`}).
        </p>
      )}
    </details>
  )
}
