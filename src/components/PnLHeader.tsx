import type { BotStatus } from "../lib/types"

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export default function PnLHeader({ status }: { status: BotStatus }) {
  const day = status.trading_day ? ` · ${status.trading_day}` : ""
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Metric
        label={`💰 Today's PnL (₹)${day}`}
        value={(status.day_pnl ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
        sub={`${(status.unrealized_pnl ?? 0) >= 0 ? "+" : ""}${(status.unrealized_pnl ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} open`}
      />
      <Metric
        label="Realized today (₹)"
        value={(status.realized_pnl ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
      />
      <Metric
        label="Open positions"
        value={String(Object.keys(status.open_positions ?? {}).length)}
      />
    </div>
  )
}
