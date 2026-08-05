import { useEffect, useState } from "react"
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import DataTable from "../../components/DataTable"
import { api, ApiError } from "../../lib/api"
import type { BacktestResult, Instrument, StrategyInfo } from "../../lib/types"

const MODES = ["Intraday", "Swing", "Scalper"] as const

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

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<BacktestResult>("/backtest/run", {
        ticker,
        mode,
        strategy_key: strategyKey,
        start,
        end,
        initial_capital: capital,
        min_score: minScore,
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Backtest failed.")
    } finally {
      setBusy(false)
    }
  }

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
      {error && <p className="text-sm text-red-400">{error}</p>}

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
          </p>

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
