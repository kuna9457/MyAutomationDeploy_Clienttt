import { useEffect, useState } from "react"
import DataTable from "../../components/DataTable"
import TradeChart from "../../components/TradeChart"
import { api, ApiError } from "../../lib/api"
import type { ChartCandles, ChartSymbol } from "../../lib/types"

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export default function TradeChartsTab() {
  const [environment, setEnvironment] = useState<"Live" | "Paper">("Paper")
  const [start, setStart] = useState(isoDaysAgo(30))
  const [end, setEnd] = useState(isoDaysAgo(0))
  const [strategy, setStrategy] = useState("")
  const [strategies, setStrategies] = useState<string[]>([])
  const [symbols, setSymbols] = useState<ChartSymbol[]>([])
  const [selected, setSelected] = useState<string>("")
  const [chart, setChart] = useState<ChartCandles | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const query = { environment, strategy, start, end }

  const loadSymbols = async () => {
    setBusy(true)
    setError(null)
    setChart(null)
    setSelected("")
    try {
      const res = await api.post<{ symbols: ChartSymbol[]; strategies: string[] }>(
        "/chart/symbols",
        query,
      )
      setSymbols(res.symbols)
      setStrategies(res.strategies)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load symbols.")
    } finally {
      setBusy(false)
    }
  }

  // Load once on mount so the tab is useful without pressing anything.
  useEffect(() => {
    loadSymbols()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openSymbol = async (symbol: string) => {
    setBusy(true)
    setError(null)
    setSelected(symbol)
    try {
      setChart(
        await api.post<ChartCandles>("/chart/candles", { ...query, symbol }),
      )
    } catch (e) {
      setChart(null)
      setError(e instanceof ApiError ? e.message : "Could not load candles.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">📈 Trade Charts</h2>
        <p className="mt-1 text-xs text-slate-400">
          Replay what the bot did on the candles it actually decided on. Pick a
          strategy and a date range, then click a symbol to see every entry and
          exit drawn on its chart.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 sm:grid-cols-5">
        <label className="text-xs text-slate-400">
          Environment
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as "Live" | "Paper")}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
          >
            <option value="Paper">Paper</option>
            <option value="Live">Live</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Strategy
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
          >
            <option value="">All strategies</option>
            {strategies.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          From
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
          />
        </label>
        <label className="text-xs text-slate-400">
          To
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
          />
        </label>
        <button
          onClick={loadSymbols}
          disabled={busy}
          className="mt-4 h-8 rounded-lg bg-indigo-700 px-3 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {busy ? "Loading…" : "Find symbols"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          Symbols traded ({symbols.length})
        </h3>
        <DataTable
          rows={symbols}
          rowKey={(r) => r.symbol}
          empty="No trades in that window. Widen the dates or switch environment."
          columns={[
            {
              key: "sym",
              header: "Symbol",
              render: (r) => (
                <button
                  onClick={() => openSymbol(r.symbol)}
                  className={`rounded px-1.5 py-0.5 font-semibold ${
                    selected === r.symbol
                      ? "bg-indigo-900 text-indigo-200"
                      : "text-sky-400 hover:bg-slate-800"
                  }`}
                >
                  {r.symbol}
                </button>
              ),
            },
            { key: "tr", header: "Trades", render: (r) => r.trades },
            {
              key: "pnl",
              header: "PnL (₹)",
              render: (r) => (
                <span className={r.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {r.pnl.toLocaleString("en-IN")}
                </span>
              ),
            },
            { key: "win", header: "Win %", render: (r) => r.win_rate },
            { key: "mode", header: "Mode", render: (r) => r.mode },
            { key: "cat", header: "Category", render: (r) => r.category },
            {
              key: "when",
              header: "Active",
              render: (r) =>
                r.first_trade === r.last_trade
                  ? r.first_trade
                  : `${r.first_trade} → ${r.last_trade}`,
            },
          ]}
        />
      </div>

      {chart && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-200">
            {chart.symbol}{" "}
            <span className="font-normal text-slate-500">
              · {chart.interval} · {chart.mode} · {chart.trades.length} trade
              {chart.trades.length === 1 ? "" : "s"} · data: {chart.source}
            </span>
          </h3>
          {!chart.is_real_data && (
            <p className="mb-2 rounded border border-amber-800 bg-amber-950/40 p-2 text-[11px] text-amber-300">
              ⚠️ These candles are SYNTHETIC — real history could not be fetched,
              so the bars below are a random walk and the trade positions on them
              are meaningless. Check your Upstox token.
            </p>
          )}
          <TradeChart data={chart} />

          <h4 className="mb-1 mt-4 text-xs font-semibold text-slate-300">
            Trades on this chart
          </h4>
          <DataTable
            rows={chart.trades}
            rowKey={(r) => r.id}
            empty=""
            columns={[
              {
                key: "side",
                header: "Side",
                render: (r) => (r.side === "BUY" ? "🟢 LONG" : "🔴 SHORT"),
              },
              {
                key: "in",
                header: "Entry",
                render: (r) =>
                  `${r.entry_price} @ ${new Date(r.entry_time * 1000)
                    .toISOString()
                    .slice(5, 16)
                    .replace("T", " ")}`,
              },
              {
                key: "out",
                header: "Exit",
                render: (r) =>
                  r.exit_price === null
                    ? "—"
                    : `${r.exit_price} @ ${new Date(r.exit_time! * 1000)
                        .toISOString()
                        .slice(5, 16)
                        .replace("T", " ")}`,
              },
              { key: "sl", header: "SL", render: (r) => r.stop_loss ?? "—" },
              { key: "tp", header: "Target", render: (r) => r.target ?? "—" },
              {
                key: "pnl",
                header: "PnL (₹)",
                render: (r) => (
                  <span className={r.win ? "text-emerald-400" : "text-red-400"}>
                    {r.pnl}
                  </span>
                ),
              },
              { key: "why", header: "Setup", render: (r) => r.entry_reason || "—" },
              { key: "exit", header: "Closed by", render: (r) => r.exit_reason || "—" },
            ]}
          />
        </div>
      )}
    </div>
  )
}
