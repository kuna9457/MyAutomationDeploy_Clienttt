import { useEffect, useState } from "react"
import { api, ApiError } from "../lib/api"
import ClientBrokerConnect from "./ClientBrokerConnect"
import ClientBrokerCredentials from "./ClientBrokerCredentials"
import NumberInput from "./NumberInput"
import type { BotStatus, ClientModeInfo, RiskLimits } from "../lib/types"

const CLIENT_LIVE_BROKERS = ["Upstox", "Zerodha"] as const

interface Props {
  status: BotStatus | null
  onChanged: () => void
}

export default function ClientSidebar({ status, onChanged }: Props) {
  const [environment, setEnvironment] = useState<"Paper" | "Live">("Paper")
  const [broker, setBroker] = useState<(typeof CLIENT_LIVE_BROKERS)[number]>("Upstox")
  const [capital, setCapital] = useState(50000)
  const [fetchedFunds, setFetchedFunds] = useState<number | null>(null)
  const [fundsError, setFundsError] = useState<string | null>(null)
  const [riskLimits, setRiskLimits] = useState<RiskLimits | null>(null)
  // What admin has set this account to trade. Read-only: a client does not
  // choose the mode, strategy or instruments — only how much of their own
  // money is at risk. The server ignores any mode sent from here anyway.
  const [modes, setModes] = useState<ClientModeInfo[]>([])
  // Bumped when credentials are saved/removed, to re-mount the connect panel
  // so its login-url call is retried with the new key.
  const [credentialsVersion, setCredentialsVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<RiskLimits>("/risk/limits").then(setRiskLimits).catch(() => {})
    api.get<ClientModeInfo[]>("/config/client-modes").then(setModes).catch(() => {})
  }, [])

  const running = !!status?.running
  // Admin configures exactly one; the server resolves it either way.
  const activeMode = modes[0] ?? null

  const fetchFunds = async () => {
    setFundsError(null)
    try {
      const res = await api.get<{ available_funds: number | null }>(
        `/broker/my-funds?broker=${broker}`,
      )
      setFetchedFunds(res.available_funds)
    } catch (err) {
      setFetchedFunds(null)
      setFundsError(err instanceof ApiError ? err.message : "Could not fetch funds.")
    }
  }

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      // No `mode`: what to trade is admin's decision and is resolved
      // server-side. This request only says how much of MY money to use.
      await api.post("/bot/start", {
        environment,
        capital,
        broker: environment === "Live" ? broker : undefined,
      })
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start bot.")
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    setBusy(true)
    try {
      await api.post("/bot/stop")
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const saveRisk = async () => {
    if (!riskLimits) return
    setBusy(true)
    try {
      const updated = await api.put<RiskLimits>("/risk/limits", {
        ...riskLimits,
        capital_allocated: capital,
      })
      setRiskLimits(updated)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="flex h-full w-[85vw] max-w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 bg-slate-900 p-4 text-sm lg:w-80 lg:bg-slate-900/60">
      <h2 className="text-lg font-semibold text-slate-100">⚙️ Controls</h2>
      <p className="text-xs text-slate-500">
        Your admin sets the strategy and instruments traded — you choose which
        style to run, plus your broker connection, capital, and risk limits.
      </p>

      <section>
        <div className="mb-1 font-medium text-slate-300">What you trade</div>
        {activeMode === null ? (
          <p className="rounded-lg border border-amber-900/60 bg-amber-950/30 p-2 text-xs text-amber-400">
            Your admin hasn't set up trading yet — ask them to configure it
            before you start.
          </p>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
            <div className="text-slate-200">{activeMode.label}</div>
            <div className="text-[11px] text-slate-500">
              {activeMode.instrument_count} instrument
              {activeMode.instrument_count === 1 ? "" : "s"} · RR 1:
              {activeMode.risk_reward}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Set by your admin. Your bot sizes each signal to your own capital
              and risk limits, then places it in your broker account.
            </p>
          </div>
        )}
      </section>

      <section>
        <div className="mb-1 font-medium text-slate-300">Environment</div>
        {(["Paper", "Live"] as const).map((env) => (
          <label key={env} className="mb-1 flex items-center gap-2 text-slate-300">
            <input
              type="radio"
              checked={environment === env}
              onChange={() => setEnvironment(env)}
            />
            {env === "Paper" ? "Paper Trading (Sandbox)" : "Live Trading"}
          </label>
        ))}
      </section>

      {environment === "Live" && (
        <>
          <section>
            <div className="mb-1 font-medium text-slate-300">Broker</div>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
              value={broker}
              onChange={(e) => setBroker(e.target.value as typeof broker)}
            >
              {CLIENT_LIVE_BROKERS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </section>

          <ClientBrokerCredentials
            broker={broker}
            onSaved={() => setCredentialsVersion((v) => v + 1)}
          />
          <ClientBrokerConnect
            key={`${broker}-${credentialsVersion}`}
            broker={broker}
            onConnected={fetchFunds}
          />

          <section className="rounded-lg border border-slate-800 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-slate-300">Your available capital</span>
              <button
                onClick={fetchFunds}
                className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-100 hover:bg-slate-600"
              >
                Refresh
              </button>
            </div>
            {fetchedFunds !== null ? (
              <p className="text-lg font-semibold text-slate-100">
                ₹{fetchedFunds.toLocaleString("en-IN")}
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                {fundsError || "Connect your broker, then refresh to see it here."}
              </p>
            )}
          </section>
        </>
      )}

      <section>
        <div className="mb-1 font-medium text-slate-300">
          Capital to allocate for trading (₹)
        </div>
        <NumberInput
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
          value={capital}
          min={0}
          step={5000}
          onChange={setCapital}
          ariaLabel="Capital to allocate for trading"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          The bot only ever deploys up to this much, never your whole broker balance.
        </p>
      </section>

      {riskLimits && (
        <section className="rounded-lg border border-slate-800 p-3">
          <div className="mb-2 font-medium text-slate-300">🛡️ Risk Guardrails</div>
          <RiskField
            label="Max trades / day"
            value={riskLimits.max_trades_per_day}
            onChange={(v) => setRiskLimits({ ...riskLimits, max_trades_per_day: v })}
          />
          <RiskField
            label="Max qty / trade"
            value={riskLimits.max_qty_per_trade}
            onChange={(v) => setRiskLimits({ ...riskLimits, max_qty_per_trade: v })}
          />
          <RiskField
            label="Intraday leverage (x)"
            value={riskLimits.intraday_leverage}
            step={0.5}
            onChange={(v) => setRiskLimits({ ...riskLimits, intraday_leverage: v })}
          />
          <button
            onClick={saveRisk}
            disabled={busy}
            className="mt-1 w-full rounded-lg bg-slate-700 px-3 py-1.5 text-slate-100 hover:bg-slate-600 disabled:opacity-50"
          >
            💾 Save
          </button>
        </section>
      )}

      <div className="flex gap-2">
        <button
          onClick={start}
          disabled={busy || running || activeMode === null}
          className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          ▶️ Start Bot
        </button>
        <button
          onClick={stop}
          disabled={busy || !running}
          className="flex-1 rounded-lg bg-slate-700 px-3 py-2 font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-50"
        >
          ⏹️ Stop Bot
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </aside>
  )
}

function RiskField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-2">
      <label className="mb-0.5 block text-xs text-slate-400">{label}</label>
      {/* See Sidebar's RiskField: 0 means "no limit", so the box must be
          clearable without a stray zero snapping back into it. */}
      <NumberInput
        step={step}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
        value={value}
        onChange={onChange}
        ariaLabel={label}
      />
    </div>
  )
}
