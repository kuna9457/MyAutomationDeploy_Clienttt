import { useEffect, useMemo, useState } from "react"
import { api, ApiError } from "../lib/api"
import { CLIENT_SELECTABLE_MODES, MODE_LABELS as CLIENT_MODE_LABELS } from "../lib/modes"
import BrokerLoginPanel from "./BrokerLoginPanel"
import type {
  AdminBotConfig,
  BotStatus,
  BrokerStatusEntry,
  Instrument,
  RiskLimits,
  StrategyInfo,
} from "../lib/types"

const MODES = ["Intraday", "Swing", "Scalper"] as const
const BROKERS = ["Upstox", "Dhan", "Zerodha", "Kotak Neo"]
const SEGMENT_LABELS: Record<string, string> = {
  NSE_EQUITY: "NSE Equity",
  MCX_COMMODITY: "MCX Commodity",
}

interface Props {
  status: BotStatus | null
  onChanged: () => void
}

export default function Sidebar({ status, onChanged }: Props) {
  const [environment, setEnvironment] = useState<"Paper" | "Live">("Paper")
  const [mode, setMode] = useState<(typeof MODES)[number]>("Intraday")
  const [broker, setBroker] = useState(BROKERS[0])
  const [strategies, setStrategies] = useState<StrategyInfo[]>([])
  const [strategyKey, setStrategyKey] = useState("")
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [segments, setSegments] = useState<string[]>(["NSE_EQUITY"])
  const [symbols, setSymbols] = useState<string[]>([])
  const [symbolQuery, setSymbolQuery] = useState("")
  const [capital, setCapital] = useState(100000)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brokerStatus, setBrokerStatus] = useState<Record<string, BrokerStatusEntry>>({})
  const [riskLimits, setRiskLimits] = useState<RiskLimits | null>(null)
  const [botConfig, setBotConfig] = useState<AdminBotConfig | null>(null)

  useEffect(() => {
    api.get<Instrument[]>("/config/instruments").then(setInstruments).catch(() => {})
    api
      .get<Record<string, BrokerStatusEntry>>("/broker/status")
      .then(setBrokerStatus)
      .catch(() => {})
    api.get<RiskLimits>("/risk/limits").then(setRiskLimits).catch(() => {})
    api.get<AdminBotConfig>("/admin/config").then(setBotConfig).catch(() => {})
  }, [])

  useEffect(() => {
    api
      .get<StrategyInfo[]>(`/config/strategies?mode=${mode}`)
      .then((list) => {
        setStrategies(list)
        const def = list.find((s) => s.is_default) ?? list[0]
        setStrategyKey(def ? def.key : "")
      })
      .catch(() => {})
  }, [mode])

  const universe = useMemo(
    () => instruments.filter((i) => segments.includes(i.segment)),
    [instruments, segments],
  )

  useEffect(() => {
    setSymbols((prev) => {
      const allowed = new Set(universe.map((i) => i.symbol))
      const kept = prev.filter((s) => allowed.has(s))
      if (kept.length > 0) return kept
      return universe.slice(0, 10).map((i) => i.symbol)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universe])

  // Purely a view filter over `universe` — it never touches `symbols`, so
  // searching can't silently drop instruments you already ticked.
  const visibleUniverse = useMemo(() => {
    const q = symbolQuery.trim().toUpperCase()
    if (!q) return universe
    return universe.filter((i) => i.symbol.toUpperCase().includes(q))
  }, [universe, symbolQuery])

  const hiddenSelectedCount = useMemo(() => {
    if (!symbolQuery.trim()) return 0
    const shown = new Set(visibleUniverse.map((i) => i.symbol))
    return symbols.filter((s) => !shown.has(s)).length
  }, [symbols, visibleUniverse, symbolQuery])

  // "Select all" acts on what the search is currently showing, so it reads as
  // "all of these" rather than silently reaching for instruments off-screen.
  const visibleSymbols = useMemo(
    () => visibleUniverse.map((i) => i.symbol),
    [visibleUniverse],
  )
  const selectedVisibleCount = useMemo(() => {
    const chosen = new Set(symbols)
    return visibleSymbols.filter((s) => chosen.has(s)).length
  }, [symbols, visibleSymbols])
  const allVisibleSelected =
    visibleSymbols.length > 0 && selectedVisibleCount === visibleSymbols.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

  const toggleAllVisible = () => {
    setSymbols((prev) => {
      if (allVisibleSelected) {
        const drop = new Set(visibleSymbols)
        return prev.filter((s) => !drop.has(s))
      }
      return Array.from(new Set([...prev, ...visibleSymbols]))
    })
  }

  const toggleSegment = (seg: string) => {
    setSegments((prev) =>
      prev.includes(seg) ? prev.filter((s) => s !== seg) : [...prev, seg],
    )
  }

  const toggleSymbol = (sym: string) => {
    setSymbols((prev) => (prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]))
  }

  const running = !!status?.running

  const start = async () => {
    if (symbols.length === 0) {
      setError("Select at least one instrument.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.post("/bot/start", {
        environment,
        mode,
        strategy_key: strategyKey,
        segments,
        symbols,
        capital,
        broker: environment === "Live" ? broker : undefined,
        mcx_lots: {},
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

  const [configMsg, setConfigMsg] = useState<string | null>(null)
  const modeIsClientSelectable = (CLIENT_SELECTABLE_MODES as readonly string[]).includes(mode)

  const saveClientDefault = async () => {
    if (!modeIsClientSelectable) {
      setError(`${mode} is admin-only — clients can only be given ${CLIENT_SELECTABLE_MODES.join(" or ")}.`)
      return
    }
    if (symbols.length === 0) {
      setError("Select at least one instrument before saving a client default.")
      return
    }
    setBusy(true)
    setConfigMsg(null)
    try {
      const updated = await api.put<AdminBotConfig>("/admin/config", {
        mode, strategy_key: strategyKey, segments, symbols, mcx_lots: {},
      })
      setBotConfig(updated)
      setConfigMsg(`Saved — clients who pick ${mode} now trade this.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save client default.")
    } finally {
      setBusy(false)
    }
  }

  const toggleClientMode = async (m: string) => {
    const current: string[] = botConfig?.client_modes ?? []
    const next = current.includes(m) ? current.filter((x) => x !== m) : [...current, m]
    setBusy(true)
    setConfigMsg(null)
    try {
      const updated = await api.put<AdminBotConfig>("/admin/config/client-modes", {
        modes: next,
      })
      setBotConfig(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update client modes.")
    } finally {
      setBusy(false)
    }
  }

  const saveRisk = async () => {
    if (!riskLimits) return
    setBusy(true)
    try {
      const updated = await api.put<RiskLimits>("/risk/limits", riskLimits)
      setRiskLimits(updated)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="flex h-full w-[85vw] max-w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 bg-slate-900 p-4 text-sm lg:w-80 lg:bg-slate-900/60">
      <h2 className="text-lg font-semibold text-slate-100">⚙️ Controls</h2>

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

      <section>
        <div className="mb-1 font-medium text-slate-300">Trading Mode</div>
        {MODES.map((m) => (
          <label key={m} className="mb-1 flex items-center gap-2 text-slate-300">
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
            {m}
          </label>
        ))}
      </section>

      <section>
        <div className="mb-1 font-medium text-slate-300">Strategy</div>
        <select
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
          value={strategyKey}
          onChange={(e) => setStrategyKey(e.target.value)}
        >
          {strategies.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
        {strategies.find((s) => s.key === strategyKey) && (
          <p className="mt-1 text-xs text-slate-500">
            {strategies.find((s) => s.key === strategyKey)!.summary}
          </p>
        )}
      </section>

      {environment === "Live" && (
        <section>
          <div className="mb-1 font-medium text-slate-300">Live Broker</div>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={broker}
            onChange={(e) => setBroker(e.target.value)}
          >
            {BROKERS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-amber-400">
            ⚠️ Live mode places REAL orders when broker credentials are present.
          </p>
        </section>
      )}

      <section>
        <div className="mb-1 font-medium text-slate-300">Segments</div>
        {Object.entries(SEGMENT_LABELS).map(([key, label]) => (
          <label key={key} className="mb-1 flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={segments.includes(key)}
              onChange={() => toggleSegment(key)}
            />
            {label}
          </label>
        ))}
      </section>

      <section>
        <div className="mb-1 font-medium text-slate-300">
          Instruments ({symbols.length} selected)
        </div>

        <div className="relative mb-1">
          <input
            type="search"
            value={symbolQuery}
            onChange={(e) => setSymbolQuery(e.target.value)}
            placeholder="🔍 Search stocks…"
            aria-label="Search instruments"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 pr-7 text-slate-100 placeholder:text-slate-600"
          />
          {symbolQuery && (
            <button
              type="button"
              onClick={() => setSymbolQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-slate-500 hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>

        {visibleUniverse.length > 0 && (
          <label className="mb-1 flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              // Indeterminate is a DOM property, not an attribute — React has
              // no prop for it, so it has to be set on the node itself.
              ref={(el) => {
                if (el) el.indeterminate = someVisibleSelected
              }}
              onChange={toggleAllVisible}
            />
            {allVisibleSelected ? "Deselect all" : "Select all"}
            {symbolQuery.trim()
              ? ` ${visibleSymbols.length} matching`
              : ` ${visibleSymbols.length}`}
            {someVisibleSelected && ` (${selectedVisibleCount} selected)`}
          </label>
        )}

        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-800 p-2">
          {visibleUniverse.length === 0 ? (
            <p className="py-1 text-xs text-slate-500">
              {universe.length === 0
                ? "No instruments in the selected segments."
                : `No instrument matches “${symbolQuery.trim()}”.`}
            </p>
          ) : (
            visibleUniverse.map((i) => (
              <label key={i.symbol} className="flex items-center gap-2 py-0.5 text-slate-300">
                <input
                  type="checkbox"
                  checked={symbols.includes(i.symbol)}
                  onChange={() => toggleSymbol(i.symbol)}
                />
                {i.symbol}
              </label>
            ))
          )}
        </div>

        {hiddenSelectedCount > 0 && (
          <p className="mt-1 text-[11px] text-slate-500">
            {hiddenSelectedCount} selected instrument
            {hiddenSelectedCount === 1 ? " is" : "s are"} hidden by this search —
            still included when you start or save.
          </p>
        )}
      </section>

      <section>
        <div className="mb-1 font-medium text-slate-300">Total Capital (₹)</div>
        <input
          type="number"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
          value={capital}
          min={10000}
          step={10000}
          onChange={(e) => setCapital(Number(e.target.value))}
        />
      </section>

      {environment === "Live" && riskLimits && (
        <section className="rounded-lg border border-slate-800 p-3">
          <div className="mb-2 font-medium text-slate-300">🛡️ Live Risk Controls</div>
          <RiskField
            label="Capital allocated today (₹)"
            value={riskLimits.capital_allocated}
            onChange={(v) => setRiskLimits({ ...riskLimits, capital_allocated: v })}
          />
          <RiskField
            label="Max daily loss (₹)"
            value={riskLimits.max_daily_loss_cash}
            onChange={(v) => setRiskLimits({ ...riskLimits, max_daily_loss_cash: v })}
          />
          <RiskField
            label="Max daily loss (%)"
            value={riskLimits.max_daily_loss_pct}
            onChange={(v) => setRiskLimits({ ...riskLimits, max_daily_loss_pct: v })}
          />
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
            💾 Save Risk Limits
          </button>
          {status?.risk_status?.halted && (
            <p className="mt-2 text-xs text-red-400">
              🛑 Halted: {status.risk_status.halt_reason}
            </p>
          )}
        </section>
      )}

      <div className="flex gap-2">
        <button
          onClick={start}
          disabled={busy || running}
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

      <div className="rounded-lg border border-slate-800 p-3">
        <div className="mb-2 font-medium text-slate-300">👥 Client Setup</div>

        <button
          onClick={saveClientDefault}
          disabled={busy || !modeIsClientSelectable}
          className="w-full rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          💾 Save as Client Default for {mode}
        </button>
        <p className="mt-1 text-[11px] text-slate-500">
          {modeIsClientSelectable
            ? `The Strategy/Segments/Instruments picked above become what a client
               trades when they choose ${mode}. Each mode is saved separately —
               saving one leaves the other untouched.`
            : `${mode} is admin-only; clients can only be given ${CLIENT_SELECTABLE_MODES.join(" or ")}.`}
        </p>
        {configMsg && <p className="mt-1 text-xs text-emerald-400">{configMsg}</p>}

        <div className="mt-3 border-t border-slate-800 pt-2">
          <div className="mb-1 text-xs font-medium text-slate-400">
            Modes clients may choose
          </div>
          {CLIENT_SELECTABLE_MODES.map((m) => {
            // Tolerate a backend that predates per-mode config: those fields
            // are simply absent, and an absent field must read as "off", not
            // crash the whole dashboard.
            const enabled = (botConfig?.client_modes ?? []).includes(m)
            const configured = (botConfig?.by_mode?.[m]?.symbols ?? []).length > 0
            return (
              <label key={m} className="mb-1 flex items-start gap-2 text-slate-300">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={enabled}
                  disabled={busy}
                  onChange={() => toggleClientMode(m)}
                />
                <span className="text-xs">
                  {CLIENT_MODE_LABELS[m]}
                  {enabled && !configured && (
                    <span className="block text-[11px] text-amber-400">
                      ⚠️ No instruments saved yet — hidden from clients until you
                      save a default for it.
                    </span>
                  )}
                </span>
              </label>
            )
          })}
          <p className="mt-1 text-[11px] text-slate-500">
            Clients pick one of these at Start Bot and can switch by stopping the
            bot. They still never see the strategy or instrument list.
          </p>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      <section className="rounded-lg border border-slate-800 p-3">
        <div className="mb-2 font-medium text-slate-300">🚦 Broker Status</div>
        {Object.entries(brokerStatus).map(([name, info]) => (
          <div key={name} className="mb-1 text-xs text-slate-400">
            {info.ok === true ? "🟢" : info.ok === false ? "🔴" : "⚪"} <span className="text-slate-300">{name}</span>
            <div className="text-slate-500">{info.detail}</div>
          </div>
        ))}
      </section>

      <BrokerLoginPanel />
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
      <input
        type="number"
        step={step}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}
