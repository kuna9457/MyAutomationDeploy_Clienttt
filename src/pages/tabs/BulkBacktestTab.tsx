import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "../../lib/api"
import type {
  FunnelBaseline,
  FunnelJob,
  FunnelResults,
  FunnelRound,
  Instrument,
  RrHitPoint,
} from "../../lib/types"

const MODES = ["Intraday", "Swing", "Scalper"] as const
const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
/** The bar unit median_bars_to_1r / rr_curve timing is measured in, per mode. */
const BAR_UNIT: Record<string, string> = {
  Intraday: "15m bars",
  Swing: "daily bars",
  Scalper: "1m bars",
}

/** Compact "1R 61% · 1.5R 44% · 2R 31%" render of a symbol's own hit-rate
 *  curve — how far it actually gets, not just where the best net PnL rung
 *  landed. Unreliable rungs (too few trades) are dimmed, not hidden. */
function RrCurve({ curve }: { curve: RrHitPoint[] }) {
  if (!curve || curve.length === 0) return <span className="text-slate-600">—</span>
  return (
    <span className="whitespace-nowrap text-xs">
      {curve.map((p, idx) => (
        <span key={p.rr}>
          {idx > 0 && <span className="text-slate-700"> · </span>}
          <span
            className={p.reliable ? "text-slate-300" : "text-slate-600"}
            title={
              p.reliable
                ? `${p.trades} trades reached 1:${p.rr}`
                : `Only ${p.trades} trades — below the reliability floor`
            }
          >
            {p.rr}R {p.hit_rate.toFixed(0)}%
          </span>
        </span>
      ))}
    </span>
  )
}

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const VERDICT_BADGE: Record<string, { label: string; cls: string; hint: string }> = {
  holds: {
    label: "✅ holds",
    cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    hint: "Profitable across walk-forward folds on a usable sample.",
  },
  promising: {
    label: "🟡 promising",
    cls: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    hint: "Positive but thin sample — treat as a lead, not a conclusion.",
  },
  marginal: {
    label: "🟠 marginal",
    cls: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    hint: "Mixed walk-forward performance.",
  },
  overfit: {
    label: "⚠️ overfit",
    cls: "bg-red-500/20 text-red-400 border-red-500/30",
    hint: "Worked in-sample, collapsed out of sample.",
  },
  fails: {
    label: "❌ fails",
    cls: "bg-red-500/20 text-red-400 border-red-500/30",
    hint: "Failed walk-forward validation.",
  },
  unverified: {
    label: "— unverified",
    cls: "bg-slate-500/20 text-slate-500 border-slate-500/30",
    hint: "Not enough data to verify.",
  },
}

type StrategyOption = { key: string; name: string; modes?: string[] }

export default function BulkBacktestTab() {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [strategies, setStrategies] = useState<StrategyOption[]>([])
  const [symbols, setSymbols] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<(typeof MODES)[number]>("Intraday")
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(["candlestick_engine"])
  const [start, setStart] = useState(isoDaysAgo(365))
  const [end, setEnd] = useState(isoDaysAgo(0))
  const [capital, setCapital] = useState(100000)
  const [folds, setFolds] = useState(4)
  const [baselineSweep, setBaselineSweep] = useState(true)
  const [segment, setSegment] = useState<"NSE_EQUITY" | "MCX_COMMODITY">("NSE_EQUITY")
  const [job, setJob] = useState<FunnelJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [onlyKeepers, setOnlyKeepers] = useState(false)
  const [maxSymbols, setMaxSymbols] = useState(150)
  const poll = useRef<number | null>(null)

  useEffect(() => {
    api.get<Instrument[]>("/config/instruments").then(setInstruments).catch(() => {})
    api
      .get<{ max_symbols: number; strategies: StrategyOption[] }>(
        "/bulk-backtest/limits",
      )
      .then((l) => {
        setMaxSymbols(l.max_symbols)
        setStrategies(l.strategies ?? [])
      })
      .catch(() => {})
  }, [])

  // Only strategies this mode can actually run. The backend rejects the rest,
  // and a strategy that silently falls back to the mode default would rank
  // under a name the admin never picked.
  const modeStrategies = useMemo(
    () => strategies.filter((s) => !s.modes || s.modes.includes(mode)),
    [strategies, mode],
  )

  useEffect(() => {
    const allowed = new Set(modeStrategies.map((s) => s.key))
    setSelectedStrategies((prev) => {
      const kept = prev.filter((k) => allowed.has(k))
      return kept.length === prev.length ? prev : kept
    })
  }, [modeStrategies])

  // Poll while running
  useEffect(() => {
    if (!job || job.status !== "running") {
      if (poll.current) window.clearInterval(poll.current)
      poll.current = null
      return
    }
    poll.current = window.setInterval(() => {
      api
        .get<FunnelJob>(`/bulk-backtest/jobs/${job.id}`)
        .then(setJob)
        .catch(() => {})
    }, 2000)
    return () => {
      if (poll.current) window.clearInterval(poll.current)
    }
  }, [job?.id, job?.status])

  const filtered = instruments.filter(
    (i) =>
      i.segment === segment &&
      (!query || i.symbol.toLowerCase().includes(query.toLowerCase())),
  )

  const toggleSymbol = (s: string) =>
    setSymbols((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  const selectAll = () =>
    setSymbols(filtered.map((i) => i.symbol))

  const clearAll = () => setSymbols([])

  const toggleStrategy = (k: string) =>
    setSelectedStrategies((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    )

  const handleStart = async () => {
    setError(null)
    try {
      const resp = await api.post<{ job_id: string }>("/bulk-backtest/start", {
        symbols,
        strategy_keys: selectedStrategies,
        start,
        end,
        capital,
        mode,
        folds,
        baseline_rr_sweep: baselineSweep,
      })
      const j = await api.get<FunnelJob>(`/bulk-backtest/jobs/${resp.job_id}`)
      setJob(j)
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  const handleCancel = async () => {
    if (!job) return
    try {
      await api.post(`/bulk-backtest/jobs/${job.id}/cancel`, {})
    } catch {}
  }

  const results = job?.results as FunnelResults | null | undefined
  const baseline: FunnelBaseline | null = results?.baseline ?? null
  const table = results?.table ?? []
  const shown = onlyKeepers
    ? table.filter((r) => r.verdict === "holds" || r.verdict === "promising")
    : table

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-100">
          🔎 Bulk Backtest — Multi-Axis Optimizer
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Searches symbol × strategy × RR × pattern × hour × day, net of costs, then validates
          with walk-forward folds. All numbers are net of brokerage, STT, and slippage.
        </p>
      </div>

      {/* Launch form */}
      {(!job || job.status !== "running") && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 space-y-4">
          {/* Segment + Mode */}
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Segment</label>
              <select
                value={segment}
                onChange={(e) => {
                  setSegment(e.target.value as any)
                  setSymbols([])
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              >
                <option value="NSE_EQUITY">NSE Equity</option>
                <option value="MCX_COMMODITY">MCX Commodity</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              >
                {MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Capital (₹)</label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(+e.target.value)}
                className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Walk-forward folds</label>
              <input
                type="number"
                value={folds}
                min={2}
                max={10}
                onChange={(e) => setFolds(+e.target.value)}
                className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              />
            </div>
          </div>

          {/* Date range */}
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Start</label>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">End</label>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              />
            </div>
          </div>

          {/* Strategies */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Strategies</label>
            <div className="flex flex-wrap gap-2">
              {modeStrategies.map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleStrategy(s.key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    selectedStrategies.includes(s.key)
                      ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                      : "border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Symbol picker */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-slate-400">
                Symbols ({symbols.length} selected, max {maxSymbols})
              </label>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs text-indigo-400 hover:underline"
                >
                  Select all
                </button>
                <button onClick={clearAll} className="text-xs text-slate-500 hover:underline">
                  Clear
                </button>
              </div>
            </div>
            <input
              type="text"
              placeholder="Filter symbols…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
            />
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-700/50 bg-slate-800/50 p-2">
              <div className="flex flex-wrap gap-1.5">
                {filtered.map((i) => (
                  <button
                    key={i.symbol}
                    onClick={() => toggleSymbol(i.symbol)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                      symbols.includes(i.symbol)
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "bg-slate-800 text-slate-500 hover:text-slate-300 border border-transparent"
                    }`}
                  >
                    {i.symbol}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Unfiltered baseline */}
          <label className="flex max-w-2xl cursor-pointer items-start gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={baselineSweep}
              onChange={(e) => setBaselineSweep(e.target.checked)}
              className="mt-0.5 rounded border-slate-600 bg-slate-800"
            />
            <span>
              <span className="font-medium text-slate-300">
                Run the unfiltered baseline (Round 0b)
              </span>
              <br />
              Every pattern, every weekday, every session hour, no score floor — only RR
              varies. It is the control the filtered rounds are worth judging against.
              Costs one extra simulation per symbol × strategy × RR rung.
            </span>
          </label>

          {/* Launch */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleStart}
              disabled={symbols.length === 0 || selectedStrategies.length === 0}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🚀 Start Funnel Search
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </div>
      )}

      {/* Running — progress */}
      {job?.status === "running" && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-300">
              ⏳ Funnel Running — {job.label}
            </h3>
            <button
              onClick={handleCancel}
              className="rounded-lg border border-red-500/40 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10"
            >
              Cancel
            </button>
          </div>
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Round {job.round}: {job.round_name}</span>
              <span>{job.done}/{job.total} · {job.elapsed.toFixed(0)}s</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                style={{
                  width: `${job.total > 0 ? (job.done / job.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          {/* Rounds log */}
          {results?.rounds && results.rounds.length > 0 && (
            <div className="space-y-1">
              {results.rounds.map((r: FunnelRound) => (
                <div
                  key={`${r.round}-${r.name}`}
                  className="flex items-center gap-3 text-xs text-slate-400"
                >
                  <span className="w-6 text-right font-mono text-slate-500">R{r.round}</span>
                  <span className="w-28 truncate">{r.name}</span>
                  <span>
                    {r.done}/{r.total}
                  </span>
                  <span className="text-emerald-400">
                    → {r.survivors} {r.survivors_label ?? "survivors"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {job?.status === "error" && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
          <p className="text-sm text-red-400">❌ Search failed: {job.error}</p>
        </div>
      )}

      {/* Results */}
      {job?.status === "done" && results && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
            <Stat label="Tested" value={results.tested} />
            <Stat label="Holds" value={results.holds} highlight />
            <Stat label="Elapsed" value={`${results.elapsed.toFixed(0)}s`} />
            <Stat label="Folds" value={results.spec?.folds as number} />
            <div className="ml-auto">
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyKeepers}
                  onChange={(e) => setOnlyKeepers(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800"
                />
                Show only holds/promising
              </label>
            </div>
          </div>

          {/* Round 0b — the unfiltered control */}
          {baseline && baseline.by_rr.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-4">
              <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h4 className="text-sm font-semibold text-amber-300">
                  Unfiltered Baseline — RR sweep
                </h4>
                <span className="text-xs text-slate-500">{baseline.note}</span>
              </div>
              <p className="mb-3 text-sm text-slate-300">{baseline.verdict}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 text-left text-xs text-slate-500">
                      <th className="px-3 py-2">RR</th>
                      <th className="px-3 py-2 text-right">Trades</th>
                      <th className="px-3 py-2 text-right">Gross ₹</th>
                      <th className="px-3 py-2 text-right">Costs ₹</th>
                      <th className="px-3 py-2 text-right">Net ₹</th>
                      <th className="px-3 py-2 text-right">Net %</th>
                      <th className="px-3 py-2 text-right">Win %</th>
                      <th className="px-3 py-2 text-right">Pairs +ve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baseline.by_rr.map((b) => {
                      const isBest = b.rr === baseline.best_rr && b.trades > 0
                      return (
                        <tr
                          key={b.rr}
                          className={`border-b border-slate-800/50 ${
                            isBest ? "bg-emerald-500/10" : ""
                          }`}
                        >
                          <td className="px-3 py-2 font-medium text-slate-200">
                            1:{b.rr}
                            {isBest && (
                              <span className="ml-2 rounded border border-emerald-500/30 bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                                best unfiltered
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-300">{b.trades}</td>
                          <td className="px-3 py-2 text-right text-slate-400">
                            {b.gross_pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            −{b.costs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-medium ${
                              b.net_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {b.net_pnl >= 0 ? "+" : ""}
                            {b.net_pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              b.net_return_pct >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {b.net_return_pct.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right text-slate-400">
                            {b.win_rate.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right text-slate-400">
                            {b.pairs_positive}/{b.pairs}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-600">
                Equal-weight across {baseline.by_rr[0]?.pairs ?? 0} symbol × strategy pairs,
                each simulated against the full capital. Net % is the average of the
                individual returns, not a pooled portfolio return. Rungs are real
                simulations, so they are directly comparable with the table below — if a
                filtered row does not beat its own baseline rung, the filtering bought
                nothing.
              </p>
            </div>
          )}

          {/* Rounds recap */}
          {results.rounds.length > 0 && (
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
              <h4 className="mb-3 text-sm font-semibold text-slate-300">Funnel Rounds</h4>
              <div className="flex flex-wrap gap-2">
                {results.rounds.map((r) => (
                  <div
                    key={`${r.round}-${r.name}`}
                    className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-center"
                  >
                    <div className="text-xs text-slate-500">R{r.round}</div>
                    <div className="text-sm font-medium text-slate-300">{r.name}</div>
                    <div className="text-xs text-emerald-400">{r.survivors} ✓</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main results table */}
          <div className="overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Strategy</th>
                  <th className="px-3 py-2 text-right">RR</th>
                  <th
                    className="px-3 py-2"
                    title="Per rung of the RR ladder: % of this pair's trades that actually reached it before exit. Two symbols can share the same picked RR and still move completely differently — this is what tells them apart."
                  >
                    Hit-rate curve
                  </th>
                  <th
                    className="px-3 py-2 text-right"
                    title="Median bars from entry to first reaching 1R, among trades that got there at all. A slow mover needing many bars to reach even 1R is a candidate for a lower RR, a longer time-exit, or a different mode (e.g. Swing) rather than being trimmed out entirely."
                  >
                    Bars→1R
                  </th>
                  <th className="px-3 py-2 text-right">Base RR</th>
                  <th className="px-3 py-2">Patterns</th>
                  <th className="px-3 py-2">Hours</th>
                  <th className="px-3 py-2">Days</th>
                  <th className="px-3 py-2 text-right">Trades</th>
                  <th className="px-3 py-2 text-right">Net ₹</th>
                  <th className="px-3 py-2 text-right">OOS %</th>
                  <th className="px-3 py-2 text-center">Folds</th>
                  <th className="px-3 py-2">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={14} className="py-8 text-center text-slate-500">
                      {onlyKeepers
                        ? "No combinations survived all guards — this is an honest result."
                        : "No results yet."}
                    </td>
                  </tr>
                )}
                {shown.map((r, i) => {
                  const v = VERDICT_BADGE[r.verdict] ?? VERDICT_BADGE.unverified
                  return (
                    <tr
                      key={`${r.symbol}-${r.strategy_key}-${i}`}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition"
                    >
                      <td className="px-3 py-2 font-medium text-slate-200">{r.symbol}</td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{r.strategy_key}</td>
                      <td className="px-3 py-2 text-right text-slate-300">1:{r.rr}</td>
                      <td className="px-3 py-2">
                        <RrCurve curve={r.rr_curve} />
                      </td>
                      <td
                        className="px-3 py-2 text-right text-slate-400"
                        title={
                          r.median_bars_to_1r != null
                            ? `Half this pair's trades that reached 1R got there within ` +
                              `${r.median_bars_to_1r} ${BAR_UNIT[mode] ?? "bars"}.`
                            : "No trade in this pair reached 1R."
                        }
                      >
                        {r.median_bars_to_1r != null ? r.median_bars_to_1r : "—"}
                      </td>
                      <td
                        className="px-3 py-2 text-right text-xs text-slate-500"
                        title={
                          r.baseline_rr
                            ? `Best RR unfiltered: 1:${r.baseline_rr} — ` +
                              `${r.baseline_net_pnl.toLocaleString("en-IN", {
                                maximumFractionDigits: 0,
                              })} net over ${r.baseline_trades} trades`
                            : "Baseline sweep not run"
                        }
                      >
                        {r.baseline_rr ? `1:${r.baseline_rr}` : "—"}
                      </td>
                      <td className="max-w-48 truncate px-3 py-2 text-xs text-slate-400" title={r.patterns.join(", ")}>
                        {r.patterns.length > 0 ? r.patterns.join(", ") : "all"}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        {r.hours.length > 0 ? r.hours.join(", ") : "all"}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        {r.days.length > 0
                          ? r.days.map((d) => WEEKDAY[d] ?? d).join(", ")
                          : "all"}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">{r.screen_trades}</td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${
                          r.screen_net_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {r.screen_net_pnl >= 0 ? "+" : ""}
                        {r.screen_net_pnl.toLocaleString("en-IN", {
                          maximumFractionDigits: 0,
                        })}
                      </td>
                      <td
                        className={`px-3 py-2 text-right ${
                          (r.oos_return ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {r.oos_return != null ? `${r.oos_return.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-slate-400">
                        {r.folds_positive}/{r.folds_total}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${v.cls}`}
                          title={v.hint}
                        >
                          {v.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Cells tested warning */}
          <p className="text-xs text-slate-600">
            {results.tested} cells tested across {results.rounds.length} rounds.
            A winner picked from many cells needs a higher bar than one picked from few —
            the walk-forward folds are that bar.
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: number | string
  highlight?: boolean
}) {
  return (
    <div className="text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${highlight ? "text-emerald-400" : "text-slate-200"}`}>
        {value}
      </div>
    </div>
  )
}
