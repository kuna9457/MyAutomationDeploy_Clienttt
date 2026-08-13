import { useEffect, useState } from "react"
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import BacktestAnalytics from "../../components/BacktestAnalytics"
import DataTable from "../../components/DataTable"
import { api, ApiError } from "../../lib/api"
import type {
  BacktestResult,
  BulkBacktestResult,
  Instrument,
  RRSweepResult,
  StrategyInfo,
} from "../../lib/types"

const MODES = ["Intraday", "Swing", "Scalper"] as const
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
// NSE equity runs 09:15–15:30 and MCX to 23:30, so the picker spans 9–23. A
// stock backtest simply has no trades in the later hours.
const HOURS = Array.from({ length: 15 }, (_, i) => i + 9)

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const DEFAULT_SPAN: Record<string, number> = { Swing: 365, Intraday: 30, Scalper: 5 }

export default function BacktestTab() {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [ticker, setTicker] = useState("")
  const [mode, setMode] = useState<(typeof MODES)[number]>("Swing")
  const [strategies, setStrategies] = useState<StrategyInfo[]>([])
  const [strategyKey, setStrategyKey] = useState("")
  const [start, setStart] = useState(isoDaysAgo(DEFAULT_SPAN.Swing))
  const [end, setEnd] = useState(isoDaysAgo(0))
  const [capital, setCapital] = useState(100000)
  // Signal-score threshold to test. 0 = the strategy's own. This is the
  // point of the control: measure a threshold on real history before putting
  // it in front of the market.
  const [minScore, setMinScore] = useState(0)
  // Risk:reward to test. 0 = the strategy's own, matching the server-side
  // convention everywhere else (config.RR_CHOICES, admin overrides).
  const [riskReward, setRiskReward] = useState(0)
  // "single" runs one backtest; "sweep" runs one per RR in a ladder so the
  // best ratio for this symbol/window is visible in one shot instead of
  // re-running the form by hand.
  const [rrMode, setRrMode] = useState<"single" | "sweep">("single")
  const [rrStart, setRrStart] = useState(1)
  const [rrStep, setRrStep] = useState(0.25)
  const [rrEnd, setRrEnd] = useState(3)
  const [sweep, setSweep] = useState<RRSweepResult | null>(null)
  // Entry filters — BACKTEST ONLY. Empty means unrestricted, matching the
  // server's TradeFilters contract, so an untouched form runs exactly as before.
  const [tradeDays, setTradeDays] = useState<number[]>([])
  const [tradeHours, setTradeHours] = useState<number[]>([])
  const [side, setSide] = useState<"BOTH" | "BUY" | "SELL">("BOTH")
  // Bulk: run the bucket and rank it, instead of one symbol.
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkTickers, setBulkTickers] = useState<string[]>([])
  const [bulkQuery, setBulkQuery] = useState("")
  const [bulk, setBulk] = useState<BulkBacktestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BacktestResult | null>(null)

  useEffect(() => {
    api.get<Instrument[]>("/config/instruments").then((list) => {
      setInstruments(list)
      if (list.length) setTicker(list[0].symbol)
    })
  }, [])

  useEffect(() => {
    api
      .get<StrategyInfo[]>(`/config/strategies?mode=${mode}`)
      .then((list) => {
        setStrategies(list)
        const def = list.find((s) => s.is_default) ?? list[0]
        setStrategyKey(def ? def.key : "")
      })
      .catch(() => {})
    setStart(isoDaysAgo(DEFAULT_SPAN[mode] ?? 30))
  }, [mode])

  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

  const run = async () => {
    setBusy(true)
    setError(null)
    // Filters travel with every request shape below, so the single run, the
    // sweep and the bulk run are always measuring the same slice of history.
    const filters = {
      trade_days: tradeDays,
      trade_hours: tradeHours,
      side,
    }
    try {
      if (bulkMode) {
        if (bulkTickers.length === 0) {
          setError("Pick at least one symbol for a bulk run.")
          return
        }
        const res = await api.post<BulkBacktestResult>("/backtest/bulk", {
          tickers: bulkTickers,
          mode,
          strategy_key: strategyKey,
          start,
          end,
          initial_capital: capital,
          min_score: minScore,
          risk_reward: rrMode === "single" ? riskReward : 0,
          ...filters,
        })
        setBulk(res)
        setResult(null)
        setSweep(null)
      } else if (rrMode === "sweep") {
        // Only RR moves; every other input is the same as the single run, so
        // the table isolates one variable.
        const res = await api.post<RRSweepResult>("/backtest/rr-sweep", {
          ticker,
          mode,
          strategy_key: strategyKey,
          start,
          end,
          initial_capital: capital,
          min_score: minScore,
          rr_start: rrStart,
          rr_step: rrStep,
          rr_end: rrEnd,
          ...filters,
        })
        setSweep(res)
        setResult(null)
        setBulk(null)
      } else {
        const res = await api.post<BacktestResult>("/backtest/run", {
          ticker,
          mode,
          strategy_key: strategyKey,
          start,
          end,
          initial_capital: capital,
          min_score: minScore,
          risk_reward: riskReward,
          ...filters,
        })
        setResult(res)
        setSweep(null)
        setBulk(null)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Backtest failed.")
    } finally {
      setBusy(false)
    }
  }

  const rrSteps =
    rrStep >= 0.05 && rrEnd >= rrStart
      ? Math.floor((rrEnd - rrStart) / rrStep + 1e-9) + 1
      : 0

  const m = result?.metrics

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Ticker">
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
          >
            {instruments.map((i) => (
              <option key={i.symbol} value={i.symbol}>
                {i.symbol}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mode">
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={mode}
            onChange={(e) => setMode(e.target.value as (typeof MODES)[number])}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Initial Capital (₹)">
          <input
            type="number"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
          />
        </Field>
        <Field label="Signal Score (0 = strategy default)">
          <input
            type="number"
            min={0}
            max={20}
            step={0.5}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Run the same symbol and window twice at different scores to see
            what the change actually costs or earns.
          </p>
        </Field>
        <Field label="Risk : reward">
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={rrMode}
            onChange={(e) => setRrMode(e.target.value as "single" | "sweep")}
          >
            <option value="single">One ratio</option>
            <option value="sweep">Sweep a range</option>
          </select>
          {rrMode === "single" ? (
            <>
              <input
                type="number"
                min={0}
                step={0.1}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
                value={riskReward}
                onChange={(e) => setRiskReward(Number(e.target.value))}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Reward per 1 unit of risk — 2 means 1:2. 0 uses the strategy's
                own.
              </p>
            </>
          ) : (
            <>
              <div className="mt-1 grid grid-cols-3 gap-1">
                <input
                  type="number" min={0.1} step={0.1} value={rrStart}
                  aria-label="Start RR"
                  onChange={(e) => setRrStart(Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-slate-100"
                />
                <input
                  type="number" min={0.05} step={0.05} value={rrStep}
                  aria-label="RR increment"
                  onChange={(e) => setRrStep(Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-slate-100"
                />
                <input
                  type="number" min={0.1} step={0.1} value={rrEnd}
                  aria-label="End RR"
                  onChange={(e) => setRrEnd(Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-slate-100"
                />
              </div>
              <div className="mt-0.5 grid grid-cols-3 gap-1 text-[10px] text-slate-500">
                <span>start</span>
                <span>increment</span>
                <span>max</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {rrSteps > 0
                  ? `${rrSteps} run${rrSteps === 1 ? "" : "s"}: 1:${rrStart}, 1:${(
                      rrStart + rrStep
                    ).toFixed(2)} … 1:${rrEnd}. Each is a full backtest, so a
                      wide range takes a while.`
                  : "Increment must be ≥ 0.05 and max ≥ start."}
              </p>
            </>
          )}
        </Field>
        <Field label="Strategy">
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={strategyKey}
            onChange={(e) => setStrategyKey(e.target.value)}
          >
            {strategies.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start">
          <input
            type="date"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="End">
          <input
            type="date"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>

      <button
        onClick={run}
        disabled={busy || !ticker}
        className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? "Running…" : "🚀 Run Backtest"}
      </button>
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <div className="mb-2 text-xs font-semibold text-slate-200">
          Entry filters (backtest only)
        </div>
        <p className="mb-2 text-[11px] text-slate-500">
          These gate when a NEW trade may open. A position already open is always
          managed to its stop/target, so a filter can never strand one. Leave
          everything unticked for no restriction.
        </p>

        <div className="mb-2">
          <div className="mb-1 text-[11px] text-slate-400">
            Days to trade {tradeDays.length === 0 && "(all)"}
          </div>
          <div className="flex flex-wrap gap-1">
            {DAY_NAMES.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => setTradeDays((p) => toggle(p, i))}
                className={`rounded px-2 py-0.5 text-[11px] ${
                  tradeDays.includes(i)
                    ? "bg-sky-900 text-sky-200"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-2">
          <div className="mb-1 text-[11px] text-slate-400">
            Hours to trade {tradeHours.length === 0 && "(all)"}
          </div>
          <div className="flex flex-wrap gap-1">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setTradeHours((p) => toggle(p, h))}
                className={`rounded px-2 py-0.5 text-[11px] ${
                  tradeHours.includes(h)
                    ? "bg-sky-900 text-sky-200"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {h}:00
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-[11px] text-slate-400">
            Direction{" "}
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as "BOTH" | "BUY" | "SELL")}
              className="ml-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px] text-slate-100"
            >
              <option value="BOTH">Buy &amp; Sell</option>
              <option value="BUY">Buy only</option>
              <option value="SELL">Sell only</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={bulkMode}
              onChange={(e) => setBulkMode(e.target.checked)}
            />
            Bulk run — rank many symbols
          </label>
        </div>

        {bulkMode && (
          <div className="mt-2 border-t border-slate-800 pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Symbols ({bulkTickers.length} selected, max 40)
              </span>
              <button
                type="button"
                onClick={() => setBulkTickers([])}
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                clear
              </button>
            </div>
            <input
              value={bulkQuery}
              onChange={(e) => setBulkQuery(e.target.value)}
              placeholder="Search symbols…"
              className="mb-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            />
            <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
              {instruments
                .filter((i) =>
                  i.symbol.includes(bulkQuery.trim().toUpperCase()),
                )
                .slice(0, 80)
                .map((i) => (
                  <button
                    key={i.symbol}
                    type="button"
                    onClick={() => setBulkTickers((p) => toggle(p, i.symbol))}
                    className={`rounded px-1.5 py-0.5 text-[11px] ${
                      bulkTickers.includes(i.symbol)
                        ? "bg-emerald-900 text-emerald-200"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    {i.symbol}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {bulk && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">
              🏆 Symbol ranking — {bulk.tickers} symbols
              {bulk.filters && (
                <span className="ml-2 font-normal text-slate-500">
                  ({bulk.filters})
                </span>
              )}
            </h3>
            <DataTable
              // Rank is precomputed rather than taken from a render index:
              // DataTable.render receives only the row, so an index parameter
              // would be undefined and every row would read "1".
              rows={bulk.ranking.map((r, i) => ({ ...r, rank: i + 1 }))}
              rowKey={(r) => r.Ticker}
              empty="No results."
              columns={[
                { key: "rank", header: "#", render: (r) => r.rank },
                { key: "sym", header: "Symbol", render: (r) => r.Ticker },
                {
                  key: "ret",
                  header: "Return %",
                  render: (r) => (
                    <span
                      className={
                        r["Total Return %"] >= 0 ? "text-emerald-400" : "text-red-400"
                      }
                    >
                      {r["Total Return %"]}
                    </span>
                  ),
                },
                { key: "win", header: "Win %", render: (r) => r["Win Rate %"] },
                {
                  key: "tr",
                  header: "Trades",
                  render: (r) => (
                    <span className={r.Trades < 30 ? "text-amber-400" : ""}>
                      {r.Trades}
                      {r.Trades < 30 && " ⚠"}
                    </span>
                  ),
                },
                { key: "dd", header: "Max DD %", render: (r) => r["Max Drawdown %"] },
                { key: "sh", header: "Sharpe", render: (r) => r.Sharpe },
                { key: "src", header: "Data", render: (r) => r["Data Source"] },
              ]}
            />
            <p className="mt-2 text-xs text-slate-500">
              Ranked by return. ⚠ marks fewer than 30 trades — too small a sample
              to rank on, however good the number looks.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">
              📊 Pooled analytics — all {bulk.tickers} symbols
            </h3>
            <BacktestAnalytics a={bulk.analytics} />
          </div>
        </div>
      )}

      {sweep && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">
            📐 Risk:reward sweep — {ticker}, {mode}
          </h3>
          <DataTable
            rows={sweep.rows}
            rowKey={(r) => String(r.risk_reward)}
            empty="No rungs were run."
            columns={[
              {
                key: "rr",
                header: "RR",
                render: (r) => (
                  <span
                    className={
                      r.risk_reward === sweep.best_by_return
                        ? "font-semibold text-emerald-400"
                        : ""
                    }
                  >
                    1:{r.risk_reward}
                    {r.risk_reward === sweep.best_by_return && " ★"}
                  </span>
                ),
              },
              { key: "tr", header: "Trades", render: (r) => r.trades },
              {
                key: "ret",
                header: "Return %",
                render: (r) => (
                  <span
                    className={r.return_pct >= 0 ? "text-emerald-400" : "text-red-400"}
                  >
                    {r.return_pct}
                  </span>
                ),
              },
              { key: "win", header: "Win %", render: (r) => r.win_rate },
              { key: "dd", header: "Max DD %", render: (r) => r.max_drawdown },
              { key: "sh", header: "Sharpe", render: (r) => r.sharpe },
              { key: "cal", header: "Calmar", render: (r) => r.calmar },
              {
                key: "eq",
                header: "Final ₹",
                render: (r) =>
                  r.error ? (
                    <span className="text-red-400" title={r.error}>
                      failed
                    </span>
                  ) : (
                    r.final_equity.toLocaleString("en-IN")
                  ),
              },
            ]}
          />
          <p className="mt-2 text-xs text-slate-500">
            ★ = highest return. Only RR changed between rows; symbol, window,
            capital, strategy and signal score are identical, so the difference
            is RR alone. RR moves the TARGET only — position size stays
            risk-budget ÷ stop-distance, so no row risks more per trade than
            any other. Note the backtester models no slippage or brokerage, and
            lower RRs trade more often, so real costs would penalise the busier
            rows more than this table shows.
          </p>
        </div>
      )}

      {m && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Total Return %" value={String(m["Total Return %"])} />
            <Stat label="Max Drawdown %" value={String(m["Max Drawdown %"])} />
            <Stat label="Sharpe" value={String(m["Sharpe"])} />
            <Stat label="Calmar" value={String(m["Calmar"])} />
            <Stat label="Win Rate %" value={String(m["Win Rate %"])} />
          </div>
          <p className="text-xs text-slate-500">
            Trades: {String(m["Total Trades"])} · Final Equity: ₹{String(m["Final Equity"])} ·
            Data source: {String(m["Data Source"])}
            {result?.filters && ` · Filters: ${result.filters}`}
          </p>

          {result?.analytics && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-200">
                📊 Trade analytics
              </h3>
              <BacktestAnalytics a={result.analytics} />
            </div>
          )}

          {result && result.equity_curve.length > 0 && (
            <div className="h-80 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.equity_curve}>
                  <XAxis dataKey="t" hide />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Line type="monotone" dataKey="equity" stroke="#6366f1" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {result && result.trades.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-200">Backtest Trades</h3>
              <DataTable
                rows={result.trades}
                rowKey={(_, i) => String(i)}
                columns={Object.keys(result.trades[0]).map((c) => ({
                  key: c,
                  header: c,
                  render: (r) => String((r as Record<string, unknown>)[c] ?? ""),
                }))}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-400">{label}</div>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-100">{value}</div>
    </div>
  )
}
