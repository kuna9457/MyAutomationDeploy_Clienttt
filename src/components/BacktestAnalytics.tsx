import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { TradeAnalytics, AnalyticsBucket } from "../lib/types"

/* Colour roles.
 *
 * P&L is a POLARITY encoding, so it gets two hues around a zero baseline
 * rather than a categorical ramp. This green/red pair measures CVD ΔE 6.5
 * (protan) against the app's slate surface — inside the 6–8 band that is legal
 * ONLY with secondary encoding. Two are present by construction and must stay:
 *
 *   1. bars run UP for profit and DOWN for loss from a zero ReferenceLine, so
 *      direction carries the sign without colour;
 *   2. every bar is directly labelled with its signed rupee value.
 *
 * If you ever remove the zero baseline or the labels, swap this pair for the
 * documented blue↔red diverging pair instead. Win-rate charts are a single
 * series and use one hue, so they need no such treatment. */
const PROFIT = "#199e70"
const LOSS = "#e66767"
const NEUTRAL = "#3987e5"
const AXIS = "#94a3b8"
const GRID = "#1e293b"

const inr = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <h4 className="text-xs font-semibold text-slate-200">{title}</h4>
      {hint && <p className="mb-1 text-[11px] text-slate-500">{hint}</p>}
      {children}
    </div>
  )
}

function PnlTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as AnalyticsBucket
  return (
    <div className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 shadow">
      <div className="font-semibold">{d.label}</div>
      <div>PnL {inr(d.pnl)}</div>
      <div className="text-slate-400">
        {d.trades} trade{d.trades === 1 ? "" : "s"} · {d.win_rate}% win
      </div>
    </div>
  )
}

/** Vertical P&L bars around a zero baseline (weekday / hour). */
function PnlBars({ data }: { data: AnalyticsBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS, fontSize: 11 }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: AXIS, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={54}
          tickFormatter={(v: number) => inr(v)}
        />
        <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<PnlTooltip />} />
        {/* The zero line is what makes direction meaningful — see the colour note. */}
        <ReferenceLine y={0} stroke={AXIS} strokeWidth={1} />
        <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={44}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.pnl >= 0 ? PROFIT : LOSS} />
          ))}
          <LabelList
            dataKey="pnl"
            position="top"
            formatter={(v: number) => inr(v)}
            style={{ fill: AXIS, fontSize: 10 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function BacktestAnalytics({ a }: { a: TradeAnalytics }) {
  if (!a || a.total_trades === 0) {
    return (
      <p className="text-xs text-slate-500">
        No trades in this run — nothing to analyse. Loosen the filters or widen
        the date range.
      </p>
    )
  }

  const setups = [...a.by_setup].reverse() // horizontal bars read bottom-up
  const setupHeight = Math.max(150, setups.length * 26 + 30)

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          title="Total PnL by day of week"
          hint="Bucketed by the day the trade was ENTERED."
        >
          <PnlBars data={a.by_weekday} />
        </ChartCard>

        <ChartCard
          title="Total PnL by hour of day"
          hint="IST. 09:00 covers 09:00–09:59."
        >
          <PnlBars data={a.by_hour} />
        </ChartCard>

        <ChartCard
          title="Top setups by total PnL"
          hint="The strategy's own entry reason, grouped."
        >
          <ResponsiveContainer width="100%" height={setupHeight}>
            <BarChart
              layout="vertical"
              data={setups}
              margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
            >
              <XAxis
                type="number"
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => inr(v)}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fill: AXIS, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={130}
              />
              <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<PnlTooltip />} />
              <ReferenceLine x={0} stroke={AXIS} strokeWidth={1} />
              <Bar dataKey="pnl" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {setups.map((d) => (
                  <Cell key={d.label} fill={d.pnl >= 0 ? PROFIT : LOSS} />
                ))}
                <LabelList
                  dataKey="pnl"
                  position="right"
                  formatter={(v: number) => inr(v)}
                  style={{ fill: AXIS, fontSize: 10 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Win % — long vs short"
          hint="Share of trades closed in profit, per direction."
        >
          <ResponsiveContainer width="100%" height={190}>
            <BarChart
              data={a.by_side}
              margin={{ top: 16, right: 8, bottom: 4, left: 8 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={{ stroke: GRID }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<PnlTooltip />} />
              {/* Coin-flip reference: a win rate is only meaningful against the
                  RR it was earned at, and 50% is the intuitive anchor readers
                  bring anyway — drawing it stops the bars being read in a
                  vacuum. */}
              <ReferenceLine
                y={50}
                stroke={AXIS}
                strokeDasharray="3 3"
                label={{ value: "50%", fill: AXIS, fontSize: 10, position: "right" }}
              />
              {/* Single series -> one hue, identity from the axis label. */}
              <Bar dataKey="win_rate" fill={NEUTRAL} radius={[4, 4, 0, 0]} maxBarSize={56}>
                <LabelList
                  dataKey="win_rate"
                  position="top"
                  formatter={(v: number) => `${v}%`}
                  style={{ fill: AXIS, fontSize: 10 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {a.insights.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <h4 className="mb-1 text-xs font-semibold text-slate-200">
            🔑 Key insights
          </h4>
          <ul className="space-y-1">
            {a.insights.map((s) => (
              <li key={s} className="text-xs font-bold text-slate-100">
                • {s}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] font-normal text-slate-500">
            Buckets under 8 trades are excluded from these findings. The
            backtester models no slippage or brokerage, so every figure above is
            optimistic — treat them as leads to test, not conclusions.
          </p>
        </div>
      )}
    </div>
  )
}
