import { useMemo, useState } from "react"
import { api, ApiError } from "../lib/api"
import type { Instrument, StrategyGroup, StrategyInfo } from "../lib/types"

/** Drag-and-drop board: which STRATEGY trades which STOCKS.
 *
 *  A stock may sit on several strategies at once — that is deliberate. Only
 *  one POSITION per stock can be open at a time; whichever strategy signals
 *  first takes it and the others wait for it to close (capital_ledger.py).
 *
 *  Two ways to put stocks on a strategy, and they do the same thing:
 *  - TAP: tap stocks in the palette to select them (several at once), then
 *    "Add here" on a strategy. This is the one that works on a phone — touch
 *    screens never fire the native HTML5 drag events.
 *  - DRAG (mouse): drag a chip onto a card. Dragging a chip that is part of
 *    the selection drops the whole selection.
 */
export default function StrategyBoard({
  mode,
  instruments,
  strategies,
  groups,
  onSaved,
  disabled,
}: {
  mode: string
  instruments: Instrument[]
  strategies: StrategyInfo[]
  groups: StrategyGroup[]
  onSaved: (groups: StrategyGroup[]) => void
  disabled?: boolean
}) {
  const [search, setSearch] = useState("")
  const [dragging, setDragging] = useState<string | null>(null)
  // Tapped-but-not-yet-placed stocks, in tap order.
  const [selected, setSelected] = useState<string[]>([])
  const [over, setOver] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const bySymbol = useMemo(
    () => new Map(instruments.map((i) => [i.symbol, i])),
    [instruments],
  )
  const matches = useMemo(() => {
    const q = search.trim().toUpperCase()
    const pool = q ? instruments.filter((i) => i.symbol.includes(q)) : instruments
    return pool.slice(0, 60)
  }, [instruments, search])

  // How many groups each symbol sits on — surfaced on the palette chip so it
  // is obvious a stock is already assigned somewhere before dropping it again.
  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const g of groups)
      for (const s of g.symbols) counts.set(s, (counts.get(s) ?? 0) + 1)
    return counts
  }, [groups])

  const save = async (next: StrategyGroup[]) => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const saved = await api.put<StrategyGroup[]>("/admin/strategy-groups", {
        mode,
        groups: next,
      })
      onSaved(saved)
      setMsg("Board saved.")
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to save the board.")
    } finally {
      setBusy(false)
    }
  }

  const addSymbols = (key: string, symbols: string[]) => {
    const next = groups.map((g) => {
      if (g.strategy_key !== key) return g
      const fresh = symbols.filter((s) => !g.symbols.includes(s))
      return fresh.length ? { ...g, symbols: [...g.symbols, ...fresh] } : g
    })
    setSelected([])
    save(next)
  }

  const toggleSelected = (symbol: string) =>
    setSelected((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol],
    )

  const removeSymbol = (key: string, symbol: string) =>
    save(
      groups.map((g) =>
        g.strategy_key === key
          ? { ...g, symbols: g.symbols.filter((s) => s !== symbol) }
          : g,
      ),
    )

  const addGroup = (key: string) => {
    if (!key || groups.some((g) => g.strategy_key === key)) return
    save([
      ...groups,
      {
        strategy_key: key,
        symbols: [],
        mcx_lots: {},
        risk_reward: 0,
        min_score: 0,
        enabled: true,
      },
    ])
  }

  const removeGroup = (key: string) =>
    save(groups.filter((g) => g.strategy_key !== key))

  const toggleGroup = (key: string) =>
    save(
      groups.map((g) =>
        g.strategy_key === key ? { ...g, enabled: !g.enabled } : g,
      ),
    )

  const unused = strategies.filter(
    (s) => !groups.some((g) => g.strategy_key === s.key),
  )
  const lock = busy || disabled

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Tap stocks to select them, then tap <strong>Add here</strong> on a
        strategy (or drag a stock onto it with a mouse). The same
        stock may sit on several strategies — only one trade in it runs at a
        time, and the others wait for it to close.
      </p>

      {/* -- palette ------------------------------------------------------- */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search stocks…"
          className="mb-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
        />
        <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
          {matches.map((i) => {
            const n = usage.get(i.symbol) ?? 0
            const picked = selected.includes(i.symbol)
            return (
              <button
                type="button"
                key={i.symbol}
                disabled={lock}
                aria-pressed={picked}
                onClick={() => toggleSelected(i.symbol)}
                draggable={!lock}
                onDragStart={() => setDragging(i.symbol)}
                onDragEnd={() => {
                  setDragging(null)
                  setOver(null)
                }}
                title={n > 0 ? `Already on ${n} strategy/strategies` : undefined}
                className={`cursor-pointer select-none rounded border px-2 py-1 text-xs sm:px-1.5 sm:py-0.5 sm:text-[11px] ${
                  picked
                    ? "border-emerald-500 bg-emerald-900 text-emerald-100"
                    : n > 0
                      ? "border-sky-800 bg-sky-950 text-sky-300"
                      : "border-slate-700 bg-slate-800 text-slate-300"
                } ${dragging === i.symbol ? "opacity-40" : ""}`}
              >
                {picked && "✓ "}
                {i.symbol}
                {n > 0 && <span className="ml-1 text-sky-500">·{n}</span>}
              </button>
            )
          })}
          {matches.length === 0 && (
            <span className="text-[11px] text-slate-500">No match.</span>
          )}
        </div>
        {selected.length > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-emerald-300">
            <span>
              {selected.length} selected — tap <strong>Add here</strong> on a strategy.
            </span>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="rounded bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* -- one drop zone per strategy ------------------------------------ */}
      <div className="grid gap-2 sm:grid-cols-2">
        {groups.map((g) => {
          const info = strategies.find((s) => s.key === g.strategy_key)
          const active = over === g.strategy_key
          return (
            <div
              key={g.strategy_key}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(g.strategy_key)
              }}
              onDragLeave={() => setOver((o) => (o === g.strategy_key ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                setOver(null)
                if (dragging)
                  addSymbols(
                    g.strategy_key,
                    selected.includes(dragging) ? selected : [dragging],
                  )
                setDragging(null)
              }}
              className={`rounded-lg border p-2 transition-colors ${
                active
                  ? "border-emerald-500 bg-emerald-950/30"
                  : g.enabled
                    ? "border-slate-700 bg-slate-900/40"
                    : "border-slate-800 bg-slate-900/20 opacity-60"
              }`}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    {info?.name ?? g.strategy_key}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {g.symbols.length} stock{g.symbols.length === 1 ? "" : "s"}
                    {!g.enabled && " · paused"}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {selected.length > 0 && (
                    <button
                      onClick={() => addSymbols(g.strategy_key, selected)}
                      disabled={lock}
                      className="rounded bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-600 sm:px-1.5 sm:py-0.5 sm:text-[11px]"
                    >
                      + Add here ({selected.length})
                    </button>
                  )}
                  <button
                    onClick={() => toggleGroup(g.strategy_key)}
                    disabled={lock}
                    className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700"
                  >
                    {g.enabled ? "Pause" : "Resume"}
                  </button>
                  <button
                    onClick={() => removeGroup(g.strategy_key)}
                    disabled={lock}
                    className="rounded bg-red-950 px-1.5 py-0.5 text-[11px] text-red-300 hover:bg-red-900"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="flex min-h-[2.25rem] flex-wrap gap-1 rounded border border-dashed border-slate-700 p-1">
                {g.symbols.map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-200"
                  >
                    {bySymbol.get(s)?.symbol ?? s}
                    <button
                      onClick={() => removeSymbol(g.strategy_key, s)}
                      disabled={lock}
                      className="px-1 text-sm leading-none text-slate-500 hover:text-red-400 sm:px-0 sm:text-[11px]"
                      aria-label={`Remove ${s}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {g.symbols.length === 0 && (
                  <span className="px-1 text-[11px] text-slate-600">
                    {selected.length > 0 ? "Tap “Add here” above" : "Select stocks above, or drop them here"}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {groups.length === 0 && (
        <p className="rounded border border-dashed border-slate-700 p-3 text-center text-[11px] text-slate-500">
          No strategy board yet. Add a strategy below, then put stocks on it.
          While this is empty the bot runs the single strategy picked above,
          exactly as before.
        </p>
      )}

      {/* -- add a strategy ------------------------------------------------ */}
      {unused.length > 0 && (
        <select
          value=""
          disabled={lock}
          onChange={(e) => addGroup(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
        >
          <option value="">+ Add a strategy to the board…</option>
          {unused.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {msg && <p className="text-[11px] text-emerald-400">{msg}</p>}
      {err && <p className="text-[11px] text-red-400">{err}</p>}
    </div>
  )
}
