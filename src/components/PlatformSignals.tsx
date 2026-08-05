import { api } from "../lib/api"
import { usePolling } from "../lib/usePolling"
import { phaseLabel } from "../lib/modes"
import type { PlatformSignalsResponse } from "../lib/types"

/**
 * The signals the platform's shared strategy is generating right now —
 * visible whether or not THIS account has started its bot.
 *
 * The point is that a client joining at 10am can see what has been happening
 * since 09:15 instead of a blank screen, and can tell the difference between
 * "nothing is being traded" and "trades are happening without me". No
 * quantity is shown: size is decided per account from that account's own
 * capital, so it does not exist until the account actually takes the trade.
 */
export default function PlatformSignals({
  showReason = true,
}: {
  /** Admin sees WHY each signal fired; a client sees only what executed —
   *  the reason text names the setup, which is the edge itself. */
  showReason?: boolean
}) {
  const { data } = usePolling<PlatformSignalsResponse>(
    () => api.get<PlatformSignalsResponse>("/bot/platform-signals"),
    3000,
  )

  if (!data) return null
  const signals = data.signals ?? []

  return (
    <section className="mb-6 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">
          📡 Platform Signals
          {data.mode && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              {phaseLabel(data.mode)}
            </span>
          )}
        </h3>
        <span
          className={`rounded px-2 py-0.5 text-[11px] ${
            data.running
              ? "bg-emerald-950 text-emerald-300"
              : data.live
                ? "bg-amber-950 text-amber-300"
                : "bg-slate-800 text-slate-400"
          }`}
        >
          {data.running
            ? "🟢 Your bot is trading these"
            : data.live
              ? "👁️ Watching only — your bot is not started"
              : "⚪ Strategy not running"}
        </span>
      </div>

      {!data.running && data.live && (
        <p className="mb-2 text-[11px] text-amber-400/80">
          These trades are being taken on the platform right now. Your account
          is <strong>not</strong> placing them until you press Start Bot.
        </p>
      )}

      {signals.length === 0 ? (
        <p className="py-1 text-xs text-slate-500">
          {data.live
            ? "No signals yet today — the strategy is running and waiting for a setup."
            : "Nothing running. Signals appear here once the strategy is live."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Time</th>
                <th className="py-1 pr-3 font-medium">Symbol</th>
                <th className="py-1 pr-3 font-medium">Side</th>
                <th className="py-1 pr-3 font-medium">Entry</th>
                <th className="py-1 pr-3 font-medium">Stop</th>
                <th className="py-1 pr-3 font-medium">Target</th>
                <th className="py-1 pr-3 font-medium">RR</th>
                {showReason && <th className="py-1 font-medium">Reason</th>}
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {signals.map((s, i) => (
                <tr key={`${s.time}-${s.symbol}-${i}`} className="border-t border-slate-800/70">
                  <td className="py-1 pr-3 whitespace-nowrap text-slate-400">{s.time}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">{s.symbol}</td>
                  <td
                    className={`py-1 pr-3 whitespace-nowrap ${
                      s.side === "BUY" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {s.side}
                  </td>
                  <td className="py-1 pr-3 whitespace-nowrap">{s.entry}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">{s.stop}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">{s.target}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">1:{s.rr}</td>
                  {showReason && <td className="py-1 text-slate-500">{s.reason}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        Quantity isn't shown here — each account sizes the same signal to its
        own capital and risk limits. Yours appears in your Live Dashboard once
        your bot is running.
      </p>
    </section>
  )
}
