import { useState } from "react"
import DataTable from "../../components/DataTable"
import RangeResetPanel from "../../components/RangeResetPanel"
import { api, downloadFile } from "../../lib/api"
import { usePolling } from "../../lib/usePolling"
import type {
  AnalyticsSummary,
  Category,
  CategorySummary,
  DailyPnlRow,
  TradeRow,
} from "../../lib/types"

const CATEGORIES: (Category | "All")[] = ["All", "Equity", "Commodity", "Crypto"]

/** Trade fields that name the EDGE rather than the execution. Hidden from
 *  client accounts: `strategy` is the strategy key, `entry_reason` is the
 *  setup that fired ("Price>VWAP + MACD bullish cross"). A client sees what
 *  was executed in their account, never why it was chosen. */
const STRATEGY_FIELDS = ["strategy", "entry_reason"]

export default function TradeLogTab({
  showStrategy = true,
}: {
  showStrategy?: boolean
}) {
  const [env, setEnv] = useState<"Paper" | "Live">("Paper")
  // Asset-class filter. "All" sends no category so the server returns
  // everything — the same request the tab made before categories existed.
  const [category, setCategory] = useState<Category | "All">("All")
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)

  // "All" must become an empty param, not the literal string "All".
  const qCat = category === "All" ? "" : category

  const { data: byCategory } = usePolling<CategorySummary[]>(
    () => api.get(`/trades/by-category?environment=${env}`),
    null,
    [env],
  )

  const { data: summary } = usePolling<AnalyticsSummary>(
    () => api.get(`/trades/analytics?environment=${env}&category=${qCat}`),
    null,
    [env, category],
  )
  const { data: daily } = usePolling<DailyPnlRow[]>(
    () => api.get(`/trades/daily-pnl?environment=${env}&category=${qCat}`),
    null,
    [env, category],
  )
  const { data: trades, refresh: refreshTrades } = usePolling<TradeRow[]>(
    () => api.get(`/trades?environment=${env}&category=${qCat}`),
    null,
    [env, category],
  )

  // Columns are derived from whatever the row carries, so a new field added
  // server-side shows up automatically — which is why the strategy fields
  // have to be filtered out explicitly here rather than just not asked for.
  const allColumns = trades && trades.length > 0 ? Object.keys(trades[0]) : []
  const columns = showStrategy
    ? allColumns
    : allColumns.filter((c) => !STRATEGY_FIELDS.includes(c))

  const doExport = () => downloadFile(`/trades/export?environment=${env}`, `${env}_trades.xlsx`)

  const doReset = async () => {
    const stats = await api.post<{ trades_removed: number }>(`/bot/reset?environment=${env}`)
    setResetMsg(`Portfolio reset — removed ${stats.trades_removed} ${env} trade(s).`)
    setConfirmReset(false)
    refreshTrades()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        {(["Paper", "Live"] as const).map((e) => (
          <label key={e} className="flex items-center gap-2 text-sm text-slate-300">
            <input type="radio" checked={env === e} onChange={() => setEnv(e)} />
            {e}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "All")}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {byCategory && byCategory.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">
            🗂️ By Category ({env})
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {byCategory.map((row) => {
              const active = category === row.category
              const pnl = Number(row.total_pnl) || 0
              return (
                <button
                  key={row.category}
                  type="button"
                  onClick={() => setCategory(active ? "All" : row.category)}
                  className={`rounded-lg border px-4 py-3 text-left transition ${
                    active
                      ? "border-indigo-500 bg-indigo-950/40"
                      : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                  }`}
                >
                  <div className="text-xs text-slate-400">{row.category}</div>
                  <div
                    className={`text-xl font-semibold ${
                      pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-red-400" : "text-slate-100"
                    }`}
                  >
                    ₹{pnl.toLocaleString("en-IN")}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {row.total_trades} trade{row.total_trades === 1 ? "" : "s"} ·{" "}
                    {row.win_rate}% win
                  </div>
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Click a card to filter everything below to that category. Crypto is
            listed ahead of any crypto instrument existing, so the split stays
            stable when it's added.
          </p>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total Trades" value={String(summary.total_trades)} />
          <Stat label="Win Rate %" value={String(summary.win_rate)} />
          <Stat label="Total PnL (₹)" value={String(summary.total_pnl)} />
          <Stat label="Avg PnL (₹)" value={String(summary.avg_pnl)} />
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">📅 Day-wise PnL</h3>
        <DataTable
          rows={daily ?? []}
          rowKey={(r) => r.Date}
          empty="No trading days recorded yet."
          columns={[
            { key: "date", header: "Date", render: (r) => r.Date },
            { key: "trades", header: "Trades", render: (r) => r.Trades },
            { key: "wr", header: "Win Rate %", render: (r) => r["Win Rate %"] },
            { key: "pnl", header: "Realized PnL (₹)", render: (r) => r["Realized PnL (₹)"] },
          ]}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">
            {env} Trade History · collection: <code>{env === "Paper" ? "paper_trades" : "live_trades"}</code>
          </h3>
          <button
            onClick={doExport}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-600"
          >
            ⬇️ Export to Excel
          </button>
        </div>
        <DataTable
          rows={trades ?? []}
          rowKey={(r) => r.trade_id}
          empty="No trades recorded yet."
          columns={columns.map((c) => ({
            key: c,
            header: c,
            render: (r) => String((r as Record<string, unknown>)[c] ?? ""),
          }))}
        />
      </div>

      {showStrategy && <RangeResetPanel />}

      <details className="rounded-lg border border-red-950 bg-red-950/20 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-red-300">
          🧨 Danger Zone — Reset Portfolio
        </summary>
        <p className="mt-2 text-xs text-red-300/80">
          This permanently deletes all {env} trades recorded till date and starts fresh. This
          cannot be undone. Only the {env} book is affected.
        </p>
        <label className="mt-2 flex items-center gap-2 text-xs text-red-300">
          <input
            type="checkbox"
            checked={confirmReset}
            onChange={(e) => setConfirmReset(e.target.checked)}
          />
          I understand — permanently delete all {env} data.
        </label>
        <button
          onClick={doReset}
          disabled={!confirmReset}
          className="mt-2 rounded-lg bg-red-800 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-40"
        >
          🗑️ Reset Portfolio Now
        </button>
        {resetMsg && <p className="mt-2 text-xs text-emerald-400">{resetMsg}</p>}
      </details>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-semibold text-slate-100">{value}</div>
    </div>
  )
}
