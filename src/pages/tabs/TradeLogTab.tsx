import { useState } from "react"
import DataTable from "../../components/DataTable"
import { api, downloadFile } from "../../lib/api"
import { usePolling } from "../../lib/usePolling"
import type { AnalyticsSummary, DailyPnlRow, TradeRow } from "../../lib/types"

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
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)

  const { data: summary } = usePolling<AnalyticsSummary>(
    () => api.get(`/trades/analytics?environment=${env}`),
    null,
    [env],
  )
  const { data: daily } = usePolling<DailyPnlRow[]>(
    () => api.get(`/trades/daily-pnl?environment=${env}`),
    null,
    [env],
  )
  const { data: trades, refresh: refreshTrades } = usePolling<TradeRow[]>(
    () => api.get(`/trades?environment=${env}`),
    null,
    [env],
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
      <div className="flex gap-4">
        {(["Paper", "Live"] as const).map((e) => (
          <label key={e} className="flex items-center gap-2 text-sm text-slate-300">
            <input type="radio" checked={env === e} onChange={() => setEnv(e)} />
            {e}
          </label>
        ))}
      </div>

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
