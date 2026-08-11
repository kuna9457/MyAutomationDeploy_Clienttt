import PnLHeader from "../../components/PnLHeader"
import DataTable from "../../components/DataTable"
import RunConfigPanel from "../../components/RunConfigPanel"
import { phaseLabel } from "../../lib/modes"
import type { BotStatus } from "../../lib/types"

/** Collapse the engine's detailed feed string (which names the data provider
 *  and tick counts — see data_feed.py's status()) down to what a client needs
 *  to know: is data flowing, and how. Admin keeps the full string. */
function clientFeedLabel(raw: string | undefined): string {
  if (!raw) return "—"
  // startsWith, not a regex character class: these emoji are surrogate pairs,
  // and `[🟢🟡🔴]` without the /u flag captures half of one — a lone surrogate
  // that renders as a replacement character.
  const dot = ["🟢", "🟡", "🔴"].find((d) => raw.startsWith(d)) ?? ""
  const lower = raw.toLowerCase()
  if (lower.includes("websocket") && !lower.includes("connecting") && !lower.includes("down"))
    return `${dot} Live Feed`
  if (lower.includes("connecting")) return `${dot} Connecting…`
  if (lower.includes("rest")) return `${dot} REST Feed`
  if (lower.includes("simulated")) return `${dot} Simulated Feed`
  if (lower.includes("stopped")) return "🔴 Stopped"
  if (lower.includes("disconnected")) return "🔴 Disconnected"
  if (lower.includes("not started")) return "🔴 Not started"
  return dot ? `${dot} Feed` : "—"
}

export default function LiveDashboardTab({
  status,
  showStrategy = true,
}: {
  status: BotStatus | null
  /** Admin sees which strategy is running; a client sees only the phase. */
  showStrategy?: boolean
}) {
  if (!status || !status.started) {
    return (
      <p className="text-sm text-slate-400">
        Bot not started. Configure the sidebar and press <strong>Start Bot</strong>. It runs
        in Paper/Simulation mode out of the box — no broker tokens required.
      </p>
    )
  }

  const quotes = Object.values(status.live_quotes ?? {})
  const signals = status.last_signals ?? []
  const daily = status.daily_pnl ?? []
  const byStrategy = status.strategy_pnl ?? []
  const dailyByStrategy = status.daily_strategy_pnl ?? []

  return (
    <div className="space-y-6">
      <PnLHeader status={status} />

      <RunConfigPanel cfg={status.run_config} />

      <div
        className={`grid grid-cols-2 gap-3 ${
          showStrategy ? "sm:grid-cols-4" : "sm:grid-cols-3"
        }`}
      >
        <StatChip
          label="Feed"
          value={showStrategy ? status.feed_status ?? "-" : clientFeedLabel(status.feed_status)}
        />
        {showStrategy ? (
          <StatChip label="Strategy" value={status.strategy?.name ?? "-"} />
        ) : (
          <StatChip label="Phase" value={phaseLabel(status.mode)} />
        )}
        <StatChip label="Broker" value={status.broker_name ?? "-"} />
        {/* Storage backend is infrastructure, not something a client acts on. */}
        {showStrategy && <StatChip label="Storage" value={status.db_backend ?? "-"} />}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          📶 Live Market Data (WebSocket)
        </h3>
        <p className="mb-2 text-xs text-slate-500">
          Source must read WS and tick age must stay low while the market is open.
        </p>
        <DataTable
          rows={quotes}
          rowKey={(r) => r.Symbol}
          empty="Waiting for the first tick…"
          columns={[
            { key: "sym", header: "Symbol", render: (r) => r.Symbol },
            { key: "seg", header: "Segment", render: (r) => r.Segment },
            { key: "mkt", header: "Market", render: (r) => r.Market },
            { key: "ltp", header: "LTP", render: (r) => r.LTP ?? "—" },
            { key: "bid", header: "Bid", render: (r) => r.Bid ?? "—" },
            { key: "ask", header: "Ask", render: (r) => r.Ask ?? "—" },
            { key: "src", header: "Source", render: (r) => r.Source },
            { key: "age", header: "Tick age (s)", render: (r) => r["Tick age (s)"] ?? "—" },
          ]}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">📡 Detected Signals</h3>
        <DataTable
          rows={signals}
          rowKey={(r, i) => `${r.symbol}-${r.time}-${i}`}
          empty="No signals yet — waiting for strategy conditions to align."
          rowClassName={(r) => (r.status === "SKIPPED" ? "opacity-60" : "")}
          columns={[
            { key: "time", header: "Time", render: (r) => r.time },
            {
              key: "status",
              header: "",
              // A signal that fired but couldn't be funded is not a trade.
              // Marking it stops a symbol nobody can afford from reading as
              // a burst of activity.
              render: (r) =>
                r.status === "SKIPPED" ? (
                  <span
                    title={r.skip_reason || "Signal skipped"}
                    className="rounded bg-amber-950 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-amber-300"
                  >
                    skipped
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400">taken</span>
                ),
            },
            { key: "sym", header: "Symbol", render: (r) => r.symbol },
            { key: "side", header: "Side", render: (r) => r.side },
            { key: "entry", header: "Entry", render: (r) => r.entry },
            { key: "stop", header: "Stop", render: (r) => r.stop },
            { key: "target", header: "Target", render: (r) => r.target },
            { key: "rr", header: "RR", render: (r) => r.rr },
            { key: "qty", header: "Qty", render: (r) => r.qty },
            { key: "deployed", header: "Deployed (₹)", render: (r) => r.deployed.toLocaleString("en-IN") },
            // Reason names the SETUP that fired ("Price>VWAP + MACD bullish
            // cross"), which is the edge itself — admin only. A client sees
            // what was executed, never why.
            ...(showStrategy
              ? [{ key: "reason", header: "Reason", render: (r: (typeof signals)[number]) => r.reason }]
              : []),
          ]}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">📅 Day-wise PnL</h3>
        <DataTable
          rows={daily}
          rowKey={(r) => r.Date}
          empty="No trading days recorded yet."
          columns={[
            { key: "date", header: "Date", render: (r) => r.Date },
            // Which edges ran that day. The split of the day's money between
            // them is the table below.
            { key: "strats", header: "Strategies", render: (r) => r.Strategies || "—" },
            { key: "symbols", header: "Symbols", render: (r) => r.Symbols },
            { key: "trades", header: "Trades", render: (r) => r.Trades },
            { key: "closed", header: "Closed", render: (r) => r.Closed },
            { key: "open", header: "Open", render: (r) => r.Open },
            { key: "wins", header: "Wins", render: (r) => r.Wins },
            { key: "wr", header: "Win Rate %", render: (r) => r["Win Rate %"] },
            { key: "pnl", header: "Realized PnL (₹)", render: (r) => <Pnl v={r["Realized PnL (₹)"]} /> },
          ]}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">🎯 Strategy-wise PnL</h3>
        <p className="mb-2 text-xs text-slate-500">
          All-time, best first — which strategy actually earns. Symbols counts distinct
          instruments traded, not the number of trades.
        </p>
        <DataTable
          rows={byStrategy}
          rowKey={(r) => r.Strategy}
          empty="No closed trades yet — nothing to attribute."
          columns={[
            { key: "strat", header: "Strategy", render: (r) => r.Strategy },
            { key: "symbols", header: "Symbols", render: (r) => r.Symbols },
            { key: "trades", header: "Trades", render: (r) => r.Trades },
            { key: "closed", header: "Closed", render: (r) => r.Closed },
            { key: "open", header: "Open", render: (r) => r.Open },
            { key: "wins", header: "Wins", render: (r) => r.Wins },
            { key: "wr", header: "Win Rate %", render: (r) => r["Win Rate %"] },
            { key: "pnl", header: "Realized PnL (₹)", render: (r) => <Pnl v={r["Realized PnL (₹)"]} /> },
          ]}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          🗓️ Day-wise PnL by Strategy
        </h3>
        <p className="mb-2 text-xs text-slate-500">
          On this day, this strategy traded these symbols and made this much. Each day's
          rows add up to that day's total above.
        </p>
        <DataTable
          rows={dailyByStrategy}
          rowKey={(r) => `${r.Date}-${r.Strategy}`}
          empty="No trading days recorded yet."
          columns={[
            { key: "date", header: "Date", render: (r) => r.Date },
            { key: "strat", header: "Strategy", render: (r) => r.Strategy },
            { key: "symbols", header: "Symbols", render: (r) => r.Symbols },
            { key: "trades", header: "Trades", render: (r) => r.Trades },
            { key: "closed", header: "Closed", render: (r) => r.Closed },
            { key: "open", header: "Open", render: (r) => r.Open },
            { key: "wins", header: "Wins", render: (r) => r.Wins },
            { key: "wr", header: "Win Rate %", render: (r) => r["Win Rate %"] },
            { key: "pnl", header: "Realized PnL (₹)", render: (r) => <Pnl v={r["Realized PnL (₹)"]} /> },
          ]}
        />
      </div>

      <p className="text-xs text-slate-500">
        {status.running ? "🔄 Live — refreshing every few seconds" : "⏸️ Bot stopped."}
      </p>
    </div>
  )
}

/** A rupee figure coloured by sign — so a losing strategy is visible at a
 *  glance rather than needing the minus sign to be read. */
function Pnl({ v }: { v: number }) {
  const cls = v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-slate-300"
  return <span className={cls}>{v.toLocaleString("en-IN")}</span>
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-200">{value}</div>
    </div>
  )
}
