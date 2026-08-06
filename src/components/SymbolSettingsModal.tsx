import { useEffect, useState } from "react"
import { api, ApiError } from "../lib/api"
import { isDefaultSymbolConfig, type SymbolConfig } from "../lib/types"

/**
 * The ⚙️ panel behind each instrument in the sidebar: that one stock's own
 * trading days, session window and risk:reward, for the currently selected
 * mode.
 *
 * Everything here is OPT-IN. Untouched, the form is all-defaults, which the
 * backend stores as "no entry at all" — the symbol then trades exactly the way
 * the strategy alone dictates. That is why "Reset to default" is a first-class
 * button rather than a hidden state: clearing the form and saving is the same
 * thing as never having configured the symbol.
 */

const DAYS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
]

/**
 * Selectable 1-hour trading slots, 9 AM through 11 PM — the span that covers
 * both segments (NSE equity 09:15–15:30, MCX 09:00–23:30).
 *
 * Each slot is INDEPENDENT, not a range: selecting 9, 10, 11 and 3 means the
 * bot trades 09:00–11:59 and 15:00–15:59 and sits out everything between.
 * That gap is the whole point — a From/To window cannot say "trade all day
 * but skip 2pm", which is a perfectly ordinary thing to want.
 *
 * The exchange's own session is still the outer gate, so selecting 9 AM for
 * an equity stock just means "no extra restriction before the open".
 */
const HOUR_SLOTS = Array.from({ length: 15 }, (_, i) => {
  const h = i + 9
  const suffix = h < 12 ? "am" : "pm"
  const display = h % 12 === 0 ? 12 : h % 12
  return { hour: h, label: `${display}${suffix}` }
})

interface Props {
  mode: string
  symbol: string
  /** What is stored today; the form opens seeded from it. */
  initial: SymbolConfig
  /** RR values the backend accepts, from GET /config/rr-choices. */
  rrChoices: { value: number; label: string }[]
  /** Called with the full refreshed {symbol: config} map after a save/reset. */
  onSaved: (all: Record<string, SymbolConfig>) => void
  onClose: () => void
}

/** "9am-12pm, 3pm-4pm" — consecutive slots collapsed, each range ending at
 *  the hour AFTER the last selected one, because selecting 3pm trades through
 *  15:59. Mirrors symbol_config.format_hours() on the server. */
function describeHours(hours: number[]): string {
  if (hours.length === 0) return ""
  const label = (h: number) => {
    const n = h % 24
    return `${n % 12 === 0 ? 12 : n % 12}${n < 12 ? "am" : "pm"}`
  }
  const sorted = [...hours].sort((a, b) => a - b)
  const runs: [number, number][] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (const h of sorted.slice(1)) {
    if (h === prev + 1) { prev = h; continue }
    runs.push([start, prev]); start = prev = h
  }
  runs.push([start, prev])
  return runs.map(([a, b]) => `${label(a)}-${label(b + 1)}`).join(", ")
}

export default function SymbolSettingsModal({
  mode,
  symbol,
  initial,
  rrChoices,
  onSaved,
  onClose,
}: Props) {
  const [cfg, setCfg] = useState<SymbolConfig>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed when the panel is reused for a different stock without unmounting.
  useEffect(() => setCfg(initial), [initial, symbol])

  // Escape closes, matching what a dialog is expected to do.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const toggleDay = (d: number) =>
    setCfg((prev) => ({
      ...prev,
      trade_days: prev.trade_days.includes(d)
        ? prev.trade_days.filter((x) => x !== d)
        : [...prev.trade_days, d].sort((a, b) => a - b),
    }))

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const all = await api.put<Record<string, SymbolConfig>>("/admin/symbol-config", {
        mode,
        symbol,
        ...cfg,
      })
      onSaved(all)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save settings.")
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    setBusy(true)
    setError(null)
    try {
      const all = await api.del<Record<string, SymbolConfig>>(
        `/admin/symbol-config/${mode}/${symbol}`,
      )
      onSaved(all)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset settings.")
    } finally {
      setBusy(false)
    }
  }

  const usingDefaults = isDefaultSymbolConfig(cfg)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`${symbol} settings`}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">⚙️ {symbol}</h3>
            <p className="text-xs text-slate-500">
              Custom settings for {mode}. Leave everything blank and this stock
              trades exactly as the strategy says.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 py-0.5 text-slate-500 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <section className="mb-4">
          <div className="mb-1 font-medium text-slate-300">Trading days</div>
          <div className="flex flex-wrap gap-1">
            {DAYS.map((d) => {
              const on = cfg.trade_days.includes(d.value)
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(d.value)}
                  className={`rounded-lg border px-2.5 py-1 text-xs ${
                    on
                      ? "border-indigo-500 bg-indigo-600 text-white"
                      : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {cfg.trade_days.length === 0
              ? "None selected = trade every day the market is open (default)."
              : "New trades only open on the selected days."}
          </p>
        </section>

        <section className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-slate-300">Trading hours (IST)</span>
            {cfg.trade_hours.length > 0 && (
              <button
                type="button"
                onClick={() => setCfg({ ...cfg, trade_hours: [] })}
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {HOUR_SLOTS.map((slot) => {
              const on = cfg.trade_hours.includes(slot.hour)
              return (
                <button
                  key={slot.hour}
                  type="button"
                  aria-pressed={on}
                  title={`${String(slot.hour).padStart(2, "0")}:00–${String(
                    slot.hour,
                  ).padStart(2, "0")}:59`}
                  onClick={() =>
                    setCfg({
                      ...cfg,
                      trade_hours: on
                        ? cfg.trade_hours.filter((h) => h !== slot.hour)
                        : [...cfg.trade_hours, slot.hour].sort((a, b) => a - b),
                    })
                  }
                  className={`rounded-lg border px-2 py-1 text-xs ${
                    on
                      ? "border-indigo-500 bg-indigo-600 text-white"
                      : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {slot.label}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {cfg.trade_hours.length === 0
              ? "None selected = trade the whole session (default)."
              : `Selected: ${describeHours(cfg.trade_hours)}. Each button is one full hour — 3pm covers 15:00–15:59.`}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Deselect an hour to sit it out and resume at the next selected one.
            Outside these hours no NEW trade opens in this stock; positions
            already open keep running to their stop/target as usual.
          </p>
          {(cfg.start_time || cfg.end_time) && cfg.trade_hours.length === 0 && (
            <p className="mt-1 text-[11px] text-amber-400">
              This stock still uses an older From/To window (
              {cfg.start_time || "open"}–{cfg.end_time || "close"}). Pick hours
              above to replace it.
            </p>
          )}
          <label className="mt-2 flex items-start gap-2 text-slate-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={cfg.square_off_at_end}
              onChange={(e) =>
                setCfg({ ...cfg, square_off_at_end: e.target.checked })
              }
            />
            <span className="text-xs">
              Also square off any open position outside these hours
              <span className="block text-[11px] text-slate-500">
                Off by default. On, the position is closed at market as soon
                as an unselected hour begins, instead of waiting for its stop
                or target.
              </span>
            </span>
          </label>
        </section>

        <section className="mb-4">
          <div className="mb-1 font-medium text-slate-300">Risk : reward</div>
          <select
            value={cfg.risk_reward}
            onChange={(e) => setCfg({ ...cfg, risk_reward: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
          >
            <option value={0}>Use the strategy's own (default)</option>
            {rrChoices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            Moves this stock's TARGET only. Position size stays
            risk-budget ÷ stop-distance, so this can never change how much a
            trade risks.
          </p>
        </section>

        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            💾 Save
          </button>
          <button
            onClick={reset}
            disabled={busy}
            title="Remove this stock's custom settings entirely"
            className="rounded-lg bg-slate-700 px-3 py-2 font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-50"
          >
            ↺ Reset
          </button>
        </div>
        {usingDefaults && (
          <p className="mt-2 text-[11px] text-slate-500">
            Nothing customised — saving this is the same as resetting.
          </p>
        )}
      </div>
    </div>
  )
}
