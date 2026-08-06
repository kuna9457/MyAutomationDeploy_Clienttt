import { useEffect, useMemo, useRef, useState } from "react"
import { api, ApiError } from "../lib/api"
import { CLIENT_SELECTABLE_MODES, MODE_LABELS as CLIENT_MODE_LABELS } from "../lib/modes"
import BrokerLoginPanel from "./BrokerLoginPanel"
import SymbolSettingsModal from "./SymbolSettingsModal"
import { EMPTY_SYMBOL_CONFIG, type SymbolConfig } from "../lib/types"
import type {
  AdminBotConfig,
  BotStatus,
  BrokerStatusEntry,
  ControlPreset,
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
  // Signal-score threshold for the selected mode. 0 = inherit the strategy's
  // own. Raising it takes fewer, higher-agreement setups; lowering it takes
  // more, weaker ones. Never affects position size or the risk cap.
  const [minScore, setMinScore] = useState(0)
  // How many LOTS each commodity trades. Commodities are fixed-lot: the bot
  // doesn't solve for quantity the way it does for equity, so this is the one
  // number that decides commodity position size. Absent = 1 lot.
  const [mcxLots, setMcxLots] = useState<Record<string, number>>({})
  // End-of-session flat-out. "" = the segment's own default (15:09 equity).
  // ON by default: an intraday position left past the close is squared by the
  // broker at whatever the auction prints, or becomes an unfunded delivery.
  const [squareOffTime, setSquareOffTime] = useState("")
  const [squareOffEnabled, setSquareOffEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brokerStatus, setBrokerStatus] = useState<Record<string, BrokerStatusEntry>>({})
  const [riskLimits, setRiskLimits] = useState<RiskLimits | null>(null)
  const [botConfig, setBotConfig] = useState<AdminBotConfig | null>(null)
  // Per-stock settings for the CURRENT mode: symbol -> its overrides. Only
  // symbols that actually deviate appear here (the backend deletes no-op
  // entries), so `symbolConfigs[sym]` being undefined is the normal case and
  // means "trades the way the strategy says".
  const [symbolConfigs, setSymbolConfigs] = useState<Record<string, SymbolConfig>>({})
  const [rrChoices, setRrChoices] = useState<{ value: number; label: string }[]>([])
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  // Saved Controls presets: the whole panel under a name.
  const [presets, setPresets] = useState<Record<string, ControlPreset>>({})
  const [presetName, setPresetName] = useState("")
  const [presetMsg, setPresetMsg] = useState<string | null>(null)
  // Loading a preset sets `mode`, which fires the strategy effect below and
  // would otherwise immediately reset strategyKey to that mode's DEFAULT,
  // discarding the strategy the preset saved. Parking it here lets that effect
  // honour the preset's choice once the new mode's list has actually arrived.
  const pendingStrategyKey = useRef<string | null>(null)

  useEffect(() => {
    api.get<Instrument[]>("/config/instruments").then(setInstruments).catch(() => {})
    api
      .get<Record<string, BrokerStatusEntry>>("/broker/status")
      .then(setBrokerStatus)
      .catch(() => {})
    api.get<RiskLimits>("/risk/limits").then(setRiskLimits).catch(() => {})
    api.get<AdminBotConfig>("/admin/config").then(setBotConfig).catch(() => {})
    api
      .get<{ choices: { value: number; label: string }[] }>("/config/rr-choices")
      .then((r) => setRrChoices(r.choices))
      .catch(() => {})
    api.get<Record<string, ControlPreset>>("/admin/presets").then(setPresets).catch(() => {})
  }, [])

  // Per-stock settings are stored per mode (a 1-minute Scalper and a 15-minute
  // Intraday want different windows on the same ticker), so switching mode
  // reloads them. A failure reads as "none configured" rather than blocking
  // the sidebar — worst case the gear opens an empty form.
  useEffect(() => {
    setSettingsFor(null)
    api
      .get<Record<string, SymbolConfig>>(`/admin/symbol-config?mode=${mode}`)
      .then(setSymbolConfigs)
      .catch(() => setSymbolConfigs({}))
  }, [mode])

  useEffect(() => {
    api
      .get<StrategyInfo[]>(`/config/strategies?mode=${mode}`)
      .then((list) => {
        setStrategies(list)
        // A preset's strategy wins when it's still valid for this mode;
        // otherwise fall back to the mode's default, as before. Cleared either
        // way so a later plain mode switch behaves normally.
        const wanted = pendingStrategyKey.current
        pendingStrategyKey.current = null
        const chosen =
          (wanted ? list.find((s) => s.key === wanted) : undefined) ??
          list.find((s) => s.is_default) ??
          list[0]
        setStrategyKey(chosen ? chosen.key : "")
      })
      .catch(() => {})
  }, [mode])

  // Seed from what's saved for this mode, so the field shows what is actually
  // in force rather than resetting to "inherit" on every mode switch.
  useEffect(() => {
    setMinScore(botConfig?.by_mode?.[mode]?.min_score ?? 0)
    setSquareOffTime(botConfig?.by_mode?.[mode]?.square_off_time ?? "")
    setSquareOffEnabled(botConfig?.by_mode?.[mode]?.square_off_enabled ?? true)
    setMcxLots(botConfig?.by_mode?.[mode]?.mcx_lots ?? {})
  }, [mode, botConfig])

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
        mcx_lots: mcxLots,
        min_score: minScore,
        square_off_time: squareOffTime,
        square_off_enabled: squareOffEnabled,
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

  // -- saved Controls presets --------------------------------------------- //
  const savePreset = async () => {
    const name = presetName.trim()
    if (!name) {
      setPresetMsg("Give the preset a name first.")
      return
    }
    setBusy(true)
    setPresetMsg(null)
    try {
      // The full panel, including every per-stock setting saved under this
      // mode — not just the selected stocks — so loading restores the setup
      // byte for byte rather than a subset of it.
      const all = await api.put<Record<string, ControlPreset>>("/admin/presets", {
        name,
        environment,
        mode,
        broker,
        strategy_key: strategyKey,
        segments,
        symbols,
        capital,
        min_score: minScore,
        mcx_lots: mcxLots,
        symbol_configs: symbolConfigs,
      })
      setPresets(all)
      setPresetMsg(`Saved “${name}”.`)
    } catch (err) {
      setPresetMsg(err instanceof ApiError ? err.message : "Failed to save preset.")
    } finally {
      setBusy(false)
    }
  }

  const loadPreset = async (name: string) => {
    if (!name) return
    setBusy(true)
    setPresetMsg(null)
    try {
      // The server restores this mode's per-stock settings as part of the
      // load; everything else comes back in the response for the panel to
      // repopulate itself with. Nothing is started — Start Bot stays yours.
      const p = await api.post<ControlPreset>(
        `/admin/presets/${encodeURIComponent(name)}/load`,
      )
      setEnvironment(p.environment)
      setBroker(p.broker || BROKERS[0])
      setCapital(p.capital)
      setMinScore(p.min_score ?? 0)
      setMcxLots(p.mcx_lots ?? {})
      setSegments(p.segments)
      setSymbols(p.symbols)
      setSymbolConfigs(p.symbol_configs)
      setPresetName(name)
      if (p.mode !== mode && (MODES as readonly string[]).includes(p.mode)) {
        // Changing mode re-fetches the strategy list; park the preset's
        // strategy so that effect restores it instead of the mode default.
        pendingStrategyKey.current = p.strategy_key
        setMode(p.mode as (typeof MODES)[number])
      } else {
        setStrategyKey(p.strategy_key)
      }
      setPresetMsg(`Loaded “${name}”. Press Start Bot when you're ready.`)
    } catch (err) {
      setPresetMsg(err instanceof ApiError ? err.message : "Failed to load preset.")
    } finally {
      setBusy(false)
    }
  }

  const deletePreset = async (name: string) => {
    setBusy(true)
    setPresetMsg(null)
    try {
      const all = await api.del<Record<string, ControlPreset>>(
        `/admin/presets/${encodeURIComponent(name)}`,
      )
      setPresets(all)
      setPresetMsg(`Deleted “${name}”.`)
    } catch (err) {
      setPresetMsg(err instanceof ApiError ? err.message : "Failed to delete preset.")
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
        mode, strategy_key: strategyKey, segments, symbols, mcx_lots: mcxLots,
        min_score: minScore,
        square_off_time: squareOffTime,
        square_off_enabled: squareOffEnabled,
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

      <section className="rounded-lg border border-slate-800 p-3">
        <div className="mb-2 font-medium text-slate-300">📁 Saved Setups</div>

        {Object.keys(presets).length > 0 ? (
          <div className="mb-2 flex gap-1">
            <select
              aria-label="Load a saved setup"
              defaultValue=""
              disabled={busy}
              onChange={(e) => {
                const name = e.target.value
                e.currentTarget.value = ""
                loadPreset(name)
              }}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            >
              <option value="">Load a setup…</option>
              {Object.entries(presets).map(([name, p]) => (
                <option key={name} value={name}>
                  {name} — {p.mode}, {p.symbols.length} stock
                  {p.symbols.length === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            {presets[presetName.trim()] && (
              <button
                type="button"
                onClick={() => deletePreset(presetName.trim())}
                disabled={busy}
                title={`Delete “${presetName.trim()}”`}
                aria-label={`Delete preset ${presetName.trim()}`}
                className="rounded-lg bg-slate-800 px-2 text-slate-400 hover:bg-red-900 hover:text-red-200 disabled:opacity-50"
              >
                🗑️
              </button>
            )}
          </div>
        ) : (
          <p className="mb-2 text-[11px] text-slate-500">
            No setups saved yet.
          </p>
        )}

        <div className="flex gap-1">
          <input
            type="text"
            value={presetName}
            maxLength={60}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Name this setup…"
            aria-label="Preset name"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100 placeholder:text-slate-600"
          />
          <button
            type="button"
            onClick={savePreset}
            disabled={busy}
            className="rounded-lg bg-slate-700 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-50"
          >
            💾 Save
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Saves everything below — environment, mode, strategy, segments,
          instruments, capital and every ⚙️ per-stock setting. Loading restores
          the lot; it never starts or stops the bot.
          {presets[presetName.trim()] && (
            <span className="block text-amber-400">
              “{presetName.trim()}” already exists — saving overwrites it.
            </span>
          )}
        </p>
        {presetMsg && <p className="mt-1 text-xs text-emerald-400">{presetMsg}</p>}
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

      <section>
        <div className="mb-1 font-medium text-slate-300">
          🎯 Signal Score ({mode})
        </div>
        {(() => {
          const sel = strategies.find((s) => s.key === strategyKey)
          const own = sel?.params.cs_min_score ?? 0
          const inert = sel !== undefined && !sel.uses_min_score
          const effective = minScore > 0 ? minScore : own
          return (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={0.5}
                  value={minScore}
                  disabled={running}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={minScore}
                  disabled={running}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {minScore === 0
                  ? `0 = use the strategy's own (${own}). `
                  : `Overriding ${own} → ${effective}. `}
                Higher = fewer, higher-agreement entries. Lower = more entries
                on weaker evidence.
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                1.0 any weak pattern · 3.0 one strong candle · 6.0 ≈ two
                agreeing patterns
              </p>
              {inert && (
                <p className="mt-1 text-[11px] text-amber-400">
                  ⚠️ {sel?.name} doesn't use scoring — this setting will have no
                  effect on it.
                </p>
              )}
              {running && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Stop the bot to change it.
                </p>
              )}
            </>
          )
        })()}
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
            visibleUniverse.map((i) => {
              const custom = symbolConfigs[i.symbol]
              return (
                <div key={i.symbol} className="flex items-center gap-2 py-0.5">
                  <label className="flex flex-1 items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={symbols.includes(i.symbol)}
                      onChange={() => toggleSymbol(i.symbol)}
                    />
                    {i.symbol}
                    {custom && (
                      <span
                        title={describeSymbolConfig(custom)}
                        className="rounded bg-indigo-950 px-1 text-[10px] text-indigo-300"
                      >
                        custom
                      </span>
                    )}
                  </label>
                  {/* Commodities are FIXED-LOT: unlike equity, the bot does
                      not solve for quantity, so this number IS the position
                      size. Shown inline per symbol because one lot of GOLD
                      and one of NATGASMINI are wildly different commitments. */}
                  {i.segment === "MCX_COMMODITY" && (
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={mcxLots[i.symbol] ?? 1}
                        disabled={running}
                        title={`Lots of ${i.symbol} to trade per signal (0 = don't trade it)`}
                        aria-label={`Lots for ${i.symbol}`}
                        onChange={(e) => {
                          const n = Math.max(0, Math.floor(Number(e.target.value) || 0))
                          setMcxLots((prev) => ({ ...prev, [i.symbol]: n }))
                        }}
                        className="w-12 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-right text-[11px] text-slate-100"
                      />
                      <span className="text-[10px] text-slate-500">lot</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSettingsFor(i.symbol)}
                    title={`Settings for ${i.symbol} (${mode})`}
                    aria-label={`Settings for ${i.symbol}`}
                    className="rounded px-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                  >
                    ⚙️
                  </button>
                </div>
              )
            })
          )}
        </div>

        <p className="mt-1 text-[11px] text-slate-500">
          ⚙️ sets a stock's own trading days, time window and risk:reward for{" "}
          {mode}. Stocks without it trade exactly as the strategy says.
        </p>
        {segments.includes("MCX_COMMODITY") && (
          <p className="mt-1 text-[11px] text-slate-500">
            Commodities trade a FIXED number of lots — set it per symbol above
            (0 = skip that commodity). Margin is fetched live from your broker
            at every signal, and the trade is refused if the account can't fund
            it. Risk = lots × stop distance × contract size.
          </p>
        )}

        {hiddenSelectedCount > 0 && (
          <p className="mt-1 text-[11px] text-slate-500">
            {hiddenSelectedCount} selected instrument
            {hiddenSelectedCount === 1 ? " is" : "s are"} hidden by this search —
            still included when you start or save.
          </p>
        )}
      </section>

      {mode !== "Swing" && (
        <section>
          <div className="mb-1 font-medium text-slate-300">🔔 Square Off ({mode})</div>
          <label className="mb-1 flex items-start gap-2 text-slate-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={squareOffEnabled}
              disabled={running}
              onChange={(e) => setSquareOffEnabled(e.target.checked)}
            />
            <span className="text-xs">
              Close every open position before the session ends
            </span>
          </label>
          {squareOffEnabled && (
            <>
              <input
                type="time"
                value={squareOffTime}
                disabled={running}
                onChange={(e) => setSquareOffTime(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {squareOffTime
                  ? `Everything is flat by ${squareOffTime}, profit or loss.`
                  : "Blank = 15:09 for NSE equity, 23:15 for MCX — ahead of the close and of your broker's own auto-square-off."}
              </p>
            </>
          )}
          {!squareOffEnabled && (
            <p className="mt-1 text-[11px] text-amber-400">
              ⚠️ Off — positions can run into the close. Your broker will
              square them itself at whatever the auction prints, or a cash
              position becomes a delivery.
            </p>
          )}
        </section>
      )}

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

      {settingsFor && (
        <SymbolSettingsModal
          mode={mode}
          symbol={settingsFor}
          initial={symbolConfigs[settingsFor] ?? EMPTY_SYMBOL_CONFIG}
          rrChoices={rrChoices}
          onSaved={setSymbolConfigs}
          onClose={() => setSettingsFor(null)}
        />
      )}
    </aside>
  )
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Tooltip summary of a stock's overrides — the same facts the engine logs at
 *  start-up, so what the sidebar shows and what the bot runs read alike. */
function describeSymbolConfig(c: SymbolConfig): string {
  const bits: string[] = []
  if (c.trade_days.length > 0)
    bits.push(c.trade_days.map((d) => DAY_LABELS[d]).join("/"))
  if (c.start_time || c.end_time)
    bits.push(
      `${c.start_time || "open"}–${c.end_time || "close"}` +
        (c.square_off_at_end ? " (square off at end)" : ""),
    )
  if (c.risk_reward > 0) bits.push(`RR 1:${c.risk_reward}`)
  return bits.join(" · ")
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
