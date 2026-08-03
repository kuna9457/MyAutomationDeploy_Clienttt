import PnLHeader from "../../components/PnLHeader"
import DataTable from "../../components/DataTable"
import { api } from "../../lib/api"
import { usePolling } from "../../lib/usePolling"
import type { BotStatus, BrokerPosition, OpenPosition } from "../../lib/types"

interface PositionRow {
  symbol: string
  side: string
  qty: number
  entry: number
  ltp: number
  sl: number
  target: number
  r: number
  upnl: number
  pnlSource: "broker" | "internal"
  brokerAvg: number | null
}

function toRow(symbol: string, t: OpenPosition): PositionRow {
  const lp = t._live_price ?? t.entry_price
  const direction = t.side === "BUY" ? 1 : -1
  const mult = t.contract_multiplier ?? 1
  const brokerPnl = t._broker_pnl ?? null
  const upnl = brokerPnl !== null ? brokerPnl : (lp - t.entry_price) * t.quantity * direction * mult
  const risk = Math.abs(t.entry_price - t.stop_loss)
  const r = risk ? ((lp - t.entry_price) * direction) / risk : 0
  return {
    symbol,
    side: t.side,
    qty: t.quantity,
    entry: t.entry_price,
    ltp: lp,
    sl: t.stop_loss,
    target: t.target,
    r,
    upnl,
    pnlSource: brokerPnl !== null ? "broker" : "internal",
    brokerAvg: t._broker_avg_price ?? null,
  }
}

export default function HoldingsTab({
  status,
  onChanged,
}: {
  status: BotStatus | null
  onChanged: () => void
}) {
  const isLive = status?.environment === "Live" && status?.running
  const { data: brokerPositions, refresh: refreshBroker } = usePolling<BrokerPosition[]>(
    () => (isLive ? api.get<BrokerPosition[]>("/bot/broker-positions") : Promise.resolve([])),
    isLive ? 5000 : null,
    [isLive],
  )

  if (!status || !status.started) {
    return <p className="text-sm text-slate-400">Bot not started.</p>
  }

  const closePosition = async (symbol: string) => {
    await api.post(`/bot/positions/${symbol}/close`)
    onChanged()
  }

  const closeBrokerPosition = async (p: BrokerPosition) => {
    await api.post(
      `/bot/broker-positions/${p.symbol}/close?quantity=${p.quantity}&side=${p.side}`,
    )
    refreshBroker()
    onChanged()
  }

  const rows = Object.entries(status.open_positions ?? {}).map(([sym, t]) => toRow(sym, t))

  return (
    <div className="space-y-6">
      <PnLHeader status={status} />

      {isLive && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">
            🏦 Broker Positions (ground truth)
          </h3>
          <DataTable
            rows={brokerPositions ?? []}
            rowKey={(r) => r.symbol}
            empty="No broker-reported open positions."
            columns={[
              { key: "sym", header: "Symbol", render: (r) => r.symbol },
              { key: "side", header: "Side", render: (r) => (r.side === "BUY" ? "🟢 LONG" : "🔴 SHORT") },
              { key: "qty", header: "Qty", render: (r) => r.quantity },
              { key: "avg", header: "Avg", render: (r) => r.average_price.toFixed(2) },
              { key: "ltp", header: "LTP", render: (r) => r.last_price.toFixed(2) },
              { key: "pnl", header: "PnL (₹)", render: (r) => r.pnl.toLocaleString("en-IN") },
              {
                key: "action",
                header: "Action",
                render: (r) => (
                  <button
                    onClick={() => closeBrokerPosition(r)}
                    className="rounded bg-red-900 px-2 py-0.5 text-xs text-red-200 hover:bg-red-800"
                  >
                    ❌ Close
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">📌 Currently Open (bot-tracked)</h3>
        <DataTable
          rows={rows}
          rowKey={(r) => r.symbol}
          empty="No open positions."
          columns={[
            { key: "sym", header: "Symbol", render: (r) => r.symbol },
            { key: "side", header: "Side", render: (r) => (r.side === "BUY" ? "🟢 LONG" : "🔴 SHORT") },
            { key: "qty", header: "Qty", render: (r) => r.qty },
            { key: "entry", header: "Entry", render: (r) => r.entry.toFixed(2) },
            { key: "ltp", header: "LTP", render: (r) => r.ltp.toFixed(2) },
            { key: "sl", header: "SL", render: (r) => r.sl.toFixed(2) },
            { key: "target", header: "Target", render: (r) => r.target.toFixed(2) },
            { key: "r", header: "R", render: (r) => `${r.r >= 0 ? "+" : ""}${r.r.toFixed(2)}` },
            {
              key: "upnl",
              header: "Unreal PnL (₹)",
              render: (r) => `${r.upnl.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${r.pnlSource === "broker" ? " 🏦" : ""}`,
            },
            { key: "avg", header: "Avg (Broker)", render: (r) => (r.brokerAvg !== null ? r.brokerAvg.toFixed(2) : "—") },
            {
              key: "action",
              header: "Action",
              render: (r) => (
                <button
                  onClick={() => closePosition(r.symbol)}
                  className="rounded bg-red-900 px-2 py-0.5 text-xs text-red-200 hover:bg-red-800"
                >
                  ❌ Close
                </button>
              ),
            },
          ]}
        />
        <p className="mt-2 text-xs text-slate-500">
          R = progress in units of risk: +1.00 is the target, −1.00 is the stop. 🏦 next to
          Unreal PnL means that figure came straight from the broker's own position.
        </p>
      </div>
    </div>
  )
}
