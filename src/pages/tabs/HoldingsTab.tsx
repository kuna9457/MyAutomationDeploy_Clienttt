import PnLHeader from "../../components/PnLHeader"
import DataTable from "../../components/DataTable"
import { api } from "../../lib/api"
import { usePolling } from "../../lib/usePolling"
import type {
  BotStatus,
  BrokerPosition,
  BrokerProtection,
  OpenPosition,
} from "../../lib/types"

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
  const { data: protection } = usePolling<BrokerProtection[]>(
    () => (isLive ? api.get<BrokerProtection[]>("/bot/broker-protection") : Promise.resolve([])),
    isLive ? 5000 : null,
    [isLive],
  )

  // A symbol can carry MORE than one protective order — a GTT plus a stray
  // SL-M, say — so this indexes to a list rather than a single entry. Hiding
  // the extras would defeat the point of a panel meant to expose drift.
  const guards = new Map<string, BrokerProtection[]>()
  for (const p of protection ?? []) {
    const list = guards.get(p.symbol)
    if (list) list.push(p)
    else guards.set(p.symbol, [p])
  }
  // Protection with no position behind it: the "stray exit order left resting"
  // case the close-path warning tells you to go and verify by hand. If one of
  // these fires it OPENS a fresh naked position, so it gets its own callout.
  const held = new Set((brokerPositions ?? []).map((p) => p.symbol))
  const orphans = (protection ?? []).filter((p) => !held.has(p.symbol))

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
                key: "bsl",
                header: "SL @ Broker",
                render: (r) => {
                  const g = guards.get(r.symbol) ?? []
                  const stops = g.filter((x) => x.stop > 0)
                  if (!stops.length) {
                    return <span className="text-red-400">⚠️ none</span>
                  }
                  return (
                    <span className="text-slate-200">
                      {stops.map((s) => `${s.stop.toFixed(2)} (${s.kind})`).join(", ")}
                    </span>
                  )
                },
              },
              {
                key: "btp",
                header: "TP @ Broker",
                render: (r) => {
                  const g = guards.get(r.symbol) ?? []
                  const tps = g.filter((x) => x.target > 0)
                  if (!tps.length) {
                    // Expected for equity: an SL-M has no target leg, so the
                    // engine's polling owns the take-profit. Not an error.
                    return <span className="text-slate-500">— bot-managed</span>
                  }
                  return (
                    <span className="text-slate-200">
                      {tps.map((s) => s.target.toFixed(2)).join(", ")}
                    </span>
                  )
                },
              },
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
          <p className="mt-2 text-xs text-slate-500">
            SL/TP here is read back from the broker itself, not from what the bot
            thinks it armed — so a GTT cancelled by hand, or one that fired while
            the bot was offline, shows up as a difference. “⚠️ none” means the
            broker is holding no stop for that position: it is protected only by
            the bot's own polling, and only while the bot is running. “—
            bot-managed” under TP is normal for equity, where Kite's GTT rejects
            MIS and the resting SL-M carries no target leg.
          </p>
        </div>
      )}

      {isLive && orphans.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-amber-300">
            ⚠️ Resting orders with no position behind them
          </h3>
          <DataTable
            rows={orphans}
            rowKey={(r) => r.id}
            empty=""
            columns={[
              { key: "sym", header: "Symbol", render: (r) => r.symbol },
              { key: "kind", header: "Kind", render: (r) => r.kind },
              { key: "side", header: "Side", render: (r) => r.side },
              { key: "qty", header: "Qty", render: (r) => r.quantity },
              { key: "sl", header: "SL", render: (r) => (r.stop > 0 ? r.stop.toFixed(2) : "—") },
              { key: "tp", header: "TP", render: (r) => (r.target > 0 ? r.target.toFixed(2) : "—") },
              { key: "status", header: "Status", render: (r) => r.status },
              { key: "id", header: "Handle", render: (r) => r.id },
            ]}
          />
          <p className="mt-2 text-xs text-amber-400/80">
            These are armed at the broker but guard nothing. If one triggers it
            will OPEN a fresh position rather than close one. Cancel them in Kite
            unless you know why they are there.
          </p>
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
