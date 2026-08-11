import { useState } from "react"
import type { RunConfig } from "../lib/types"

/** What the running bot was STARTED with.
 *
 *  Deliberately reads `status.run_config` and nothing else. Everything on this
 *  panel is a frozen snapshot taken at start (engine._snapshot_run_config);
 *  rendering the sidebar's CURRENT values instead would show settings the
 *  engine is not using the moment anyone edits a preset or a per-stock rule
 *  mid-session — which is the confusion this panel exists to remove.
 */
export default function RunConfigPanel({ cfg }: { cfg: RunConfig | undefined }) {
  const [open, setOpen] = useState(false)
  if (!cfg || !cfg.started_at) return null

  const isLive = cfg.environment === "Live"

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
              isLive
                ? "bg-red-950 text-red-300"
                : "bg-emerald-950 text-emerald-300"
            }`}
          >
            {cfg.environment}
          </span>
          <span className="font-semibold text-slate-200">
            {cfg.strategy?.name ?? cfg.mode}
          </span>
          <span className="text-slate-500">
            {cfg.mode} · {cfg.timeframe} · RR 1:{cfg.risk_reward} ·{" "}
            {cfg.instruments.length} instrument
            {cfg.instruments.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="shrink-0 pl-2 text-xs text-slate-500">
          since {cfg.started_at.slice(11)} {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-800 px-3 py-3 text-xs">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            <Row label="Started" value={cfg.started_at} />
            <Row label="Broker" value={cfg.broker} />
            <Row label="Capital" value={`₹${cfg.capital.toLocaleString("en-IN")}`} />
            <Row label="Risk / trade" value={`${cfg.risk_per_trade_pct}%`} />
            <Row label="Risk : reward" value={`1:${cfg.risk_reward}`} />
            {cfg.atr_sl_mult !== undefined && (
              <Row
                label="Stop"
                value={`${cfg.atr_sl_mult}×ATR(${cfg.atr_period})`}
              />
            )}
            {cfg.min_score !== undefined && cfg.min_score > 0 && (
              <Row label="Min score" value={String(cfg.min_score)} />
            )}
            <Row
              label="Time exit"
              value={cfg.max_hold_minutes > 0 ? `${cfg.max_hold_minutes} min` : "off"}
            />
            <Row label="Shorts" value={cfg.allow_short ? "allowed" : "long only"} />
            {cfg.use_limit_entry !== undefined && (
              <Row
                label="Entry"
                value={cfg.use_limit_entry ? "limit (inside spread)" : "market"}
              />
            )}
            <Row
              label="Square off"
              value={
                cfg.square_off_enabled
                  ? cfg.square_off_time || "segment default"
                  : "off"
              }
            />
            {cfg.shared_with > 0 && (
              <Row label="Shared feed with" value={`${cfg.shared_with} account(s)`} />
            )}
          </dl>

          <div className="mt-3">
            <div className="mb-1 font-medium text-slate-400">
              Instruments ({cfg.instruments.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {cfg.instruments.map((s) => (
                <span
                  key={s}
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300"
                >
                  {s}
                  {cfg.mcx_lots[s] !== undefined && (
                    <span className="text-slate-500"> ×{cfg.mcx_lots[s]}</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 font-medium text-slate-400">
              Per-stock settings
            </div>
            {cfg.symbol_overrides.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                None — every instrument runs the plain strategy above.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {cfg.symbol_overrides.map((line) => (
                  <li key={line} className="text-[11px] text-amber-300/90">
                    ⚙️ {line}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            These are the settings this bot STARTED with. Editing the sidebar or
            a per-stock setting now does not change a running bot — stop and
            start it to apply changes.
          </p>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200">{value}</dd>
    </div>
  )
}
