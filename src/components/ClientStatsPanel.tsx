import { useEffect, useState } from "react"
import DataTable from "./DataTable"
import { api, ApiError, downloadFile } from "../lib/api"
import type { ClientStats } from "../lib/types"

const ENVIRONMENTS = ["Paper", "Live"] as const

function inr(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—"
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
}

function pnlClass(n: number | undefined): string {
  if (!n) return "text-slate-300"
  return n > 0 ? "text-emerald-400" : "text-red-400"
}

/** Admin drill-down: one client's per-day PnL and full trade list.
 *  Reads /admin/clients/{username}/stats, which is scoped server-side to that
 *  one client — the same data the client sees in their own Trade Log. */
export default function ClientStatsPanel({
  username,
  displayName,
  onClose,
}: {
  username: string
  displayName: string
  onClose: () => void
}) {
  const [environment, setEnvironment] = useState<(typeof ENVIRONMENTS)[number]>("Paper")
  const [stats, setStats] = useState<ClientStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .get<ClientStats>(
        `/admin/clients/${encodeURIComponent(username)}/stats?environment=${environment}`,
      )
      .then((s) => {
        if (!cancelled) setStats(s)
      })
      .catch((err) => {
        if (!cancelled) {
          setStats(null)
          setError(err instanceof ApiError ? err.message : "Could not load stats.")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [username, environment])

  const summary = stats?.summary
  const closed = (stats?.trades ?? []).filter((t) => t.status === "CLOSED")
  const open = (stats?.trades ?? []).filter((t) => t.status !== "CLOSED")

  return (
    <div className="rounded-lg border border-indigo-900/60 bg-slate-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">
          📊 {displayName}{" "}
          <span className="font-normal text-slate-500">({username})</span>
          {stats?.running && (
            <span className="ml-2 text-xs text-emerald-400">🟢 bot running</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {ENVIRONMENTS.map((env) => (
              <button
                key={env}
                onClick={() => setEnvironment(env)}
                className={`px-3 py-1 text-xs ${
                  environment === env
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200"
                }`}
              >
                {env}
              </button>
            ))}
          </div>
          <button
            onClick={() =>
              downloadFile(
                `/admin/clients/${encodeURIComponent(username)}/export?environment=${environment}`,
                `${username}_${environment}.xlsx`,
              )
            }
            className="rounded-lg bg-emerald-700 px-3 py-1 text-xs text-white hover:bg-emerald-600"
          >
            ⬇️ Excel
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {stats && !loading && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total PnL (₹)" value={inr(summary?.total_pnl)} cls={pnlClass(summary?.total_pnl)} />
            <Stat label="Trades" value={String(summary?.total_trades ?? 0)} />
            <Stat label="Win rate" value={`${(summary?.win_rate ?? 0).toFixed(1)}%`} />
            <Stat label="Avg PnL (₹)" value={inr(summary?.avg_pnl)} cls={pnlClass(summary?.avg_pnl)} />
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold text-slate-300">Per-day PnL</h4>
            <DataTable
              rows={stats.daily_pnl}
              rowKey={(r) => String(r.Date)}
              empty={`No ${environment} trading days yet for this client.`}
              columns={[
                { key: "d", header: "Date", render: (r) => r.Date },
                { key: "t", header: "Trades", render: (r) => r.Trades },
                { key: "c", header: "Closed", render: (r) => r.Closed },
                { key: "o", header: "Open", render: (r) => r.Open },
                { key: "w", header: "Wins", render: (r) => r.Wins },
                { key: "wr", header: "Win %", render: (r) => r["Win Rate %"] },
                {
                  key: "p",
                  header: "Realized PnL (₹)",
                  render: (r) => (
                    <span className={pnlClass(r["Realized PnL (₹)"])}>
                      {inr(r["Realized PnL (₹)"])}
                    </span>
                  ),
                },
              ]}
            />
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold text-slate-300">
              Trades ({open.length} open · {closed.length} closed)
            </h4>
            <DataTable
              rows={stats.trades}
              rowKey={(r, i) => String(r.trade_id ?? i)}
              empty={`No ${environment} trades recorded for this client.`}
              columns={[
                {
                  key: "ts",
                  header: "Time",
                  render: (r) =>
                    r.timestamp ? String(r.timestamp).replace("T", " ").slice(0, 19) : "—",
                },
                { key: "sym", header: "Symbol", render: (r) => r.ticker },
                { key: "mode", header: "Phase", render: (r) => r.mode },
                { key: "side", header: "Side", render: (r) => r.side },
                { key: "qty", header: "Qty", render: (r) => r.quantity },
                { key: "entry", header: "Entry", render: (r) => inr(r.entry_price) },
                { key: "sl", header: "SL", render: (r) => inr(r.stop_loss) },
                { key: "tgt", header: "Target", render: (r) => inr(r.target) },
                { key: "exit", header: "Exit", render: (r) => inr(r.exit_price) },
                {
                  key: "pnl",
                  header: "PnL (₹)",
                  render: (r) => (
                    <span className={pnlClass(r.realized_pnl)}>{inr(r.realized_pnl)}</span>
                  ),
                },
                {
                  key: "st",
                  header: "Status",
                  render: (r) => (r.status === "CLOSED" ? "✅ Closed" : "🟡 Open"),
                },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, cls = "text-slate-100" }: {
  label: string
  value: string
  cls?: string
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  )
}
