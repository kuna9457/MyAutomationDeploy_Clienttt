import { useEffect, useMemo, useState } from "react"
import ClientStatsPanel from "../../components/ClientStatsPanel"
import NumberInput from "../../components/NumberInput"
import { api, ApiError } from "../../lib/api"
import type { FleetNode, FleetPnl, FleetStatus } from "../../lib/fleetTypes"
import { CLIENT_SELECTABLE_MODES, MODE_LABELS } from "../../lib/modes"
import type { Instrument, StrategyInfo } from "../../lib/types"
import { usePolling } from "../../lib/usePolling"

const SEGMENT_LABELS: Record<string, string> = {
  NSE_EQUITY: "NSE Equity",
  MCX_COMMODITY: "MCX Commodity",
}

const EXIT_STYLES: { value: string; label: string }[] = [
  { value: "strategy", label: "Strategy's own (default)" },
  { value: "fixed", label: "Fixed stop / target — no management" },
  { value: "trail_full", label: "Trail the full position from entry" },
  { value: "partial_trail", label: "Book half at 1R, trail the runner" },
  { value: "partial_lock", label: "Book half at 1R, lock TP1, hold for TP2" },
  { value: "partial_ladder", label: "Book half at 1R, break-even, lock TP1 at midpoint" },
]

const inr = (n: number) =>
  `${n < 0 ? "-" : n > 0 ? "+" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`

const pnlColor = (n: number) =>
  n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-slate-400"

/** The admin's BROADCAST: pick what to trade once, and every connected client
 *  server trades it on its own capital through its own broker.
 *
 *  Deliberately a separate screen with its own Start/Stop — nothing here starts,
 *  stops or reads the Controls panel's bot. It keeps running until YOU stop it. */
export default function BroadcastTab() {
  const { data: status, refresh } = usePolling<FleetStatus>(
    () => api.get<FleetStatus>("/fleet/broadcast/status"),
    3000,
  )
  const active = !!status?.active

  // -- what to broadcast --------------------------------------------------- //
  const [environment, setEnvironment] = useState<"Paper" | "Live">("Paper")
  const [mode, setMode] = useState<(typeof CLIENT_SELECTABLE_MODES)[number]>("Intraday")
  const [strategies, setStrategies] = useState<StrategyInfo[]>([])
  const [strategyKey, setStrategyKey] = useState("")
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [segments, setSegments] = useState<string[]>(["NSE_EQUITY"])
  const [symbols, setSymbols] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [mcxLots, setMcxLots] = useState<Record<string, number>>({})
  const [rrChoices, setRrChoices] = useState<{ value: number; label: string }[]>([])
  const [riskReward, setRiskReward] = useState(0)
  const [minScore, setMinScore] = useState(0)
  const [exitStyle, setExitStyle] = useState("strategy")
  const [trailAtrMult, setTrailAtrMult] = useState(0)
  const [squareOffEnabled, setSquareOffEnabled] = useState(true)
  const [squareOffTime, setSquareOffTime] = useState("")

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  // -- how the clients are doing ------------------------------------------- //
  const [pnlEnv, setPnlEnv] = useState<"Paper" | "Live">("Paper")
  const [statsFor, setStatsFor] = useState<{ username: string; displayName: string } | null>(null)
  const { data: pnl, error: pnlError } = usePolling<FleetPnl>(
    () => api.get<FleetPnl>(`/fleet/pnl?environment=${pnlEnv}`),
    15000,
    [pnlEnv],
  )

  useEffect(() => {
    api.get<Instrument[]>("/config/instruments").then(setInstruments).catch(() => {})
    api
      .get<{ choices: { value: number; label: string }[] }>("/config/rr-choices")
      .then((r) => setRrChoices(r.choices))
      .catch(() => {})
  }, [])

  useEffect(() => {
    api
      .get<StrategyInfo[]>(`/config/strategies?mode=${mode}`)
      .then((list) => {
        setStrategies(list)
        const chosen = list.find((s) => s.is_default) ?? list[0]
        setStrategyKey(chosen ? chosen.key : "")
      })
      .catch(() => {})
  }, [mode])

  const universe = useMemo(
    () => instruments.filter((i) => segments.includes(i.segment)),
    [instruments, segments],
  )
  const visible = useMemo(() => {
    const q = query.trim().toUpperCase()
    return q ? universe.filter((i) => i.symbol.toUpperCase().includes(q)) : universe
  }, [universe, query])
  const visibleSymbols = useMemo(() => visible.map((i) => i.symbol), [visible])
  const allVisible =
    visibleSymbols.length > 0 && visibleSymbols.every((s) => symbols.includes(s))

  const toggleSymbol = (s: string) =>
    setSymbols((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
  const toggleAllVisible = () =>
    setSymbols((p) =>
      allVisible
        ? p.filter((s) => !visibleSymbols.includes(s))
        : Array.from(new Set([...p, ...visibleSymbols])),
    )
  const toggleSegment = (seg: string) =>
    setSegments((p) => (p.includes(seg) ? p.filter((s) => s !== seg) : [...p, seg]))

  const selected = strategies.find((s) => s.key === strategyKey)

  const fail = (err: unknown, fallback: string) =>
    setMsg({ kind: "err", text: err instanceof ApiError ? err.message : fallback })

  const start = async () => {
    if (symbols.length === 0) {
      setMsg({ kind: "err", text: "Select at least one instrument." })
      return
    }
    if (
      environment === "Live" &&
      !window.confirm(
        `Start a LIVE broadcast?\n\nEvery connected client server will place REAL orders on its own client's account as soon as a signal fires, sized on that client's own capital.\n\nIt keeps running until you press Stop.`,
      )
    ) {
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await api.post("/fleet/broadcast/start", {
        environment,
        mode,
        strategy_key: strategyKey,
        symbols,
        mcx_lots: mcxLots,
        risk_reward: riskReward,
        min_score: minScore,
        square_off_time: squareOffTime,
        square_off_enabled: squareOffEnabled,
        exit_style: exitStyle,
        trail_atr_mult: trailAtrMult,
        confirm_live: environment === "Live",
      })
      setMsg({ kind: "ok", text: "Broadcast started. It runs until you stop it." })
      refresh()
    } catch (err) {
      fail(err, "Failed to start the broadcast.")
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    if (
      !window.confirm(
        "Stop the broadcast for EVERY client?\n\nTheir bots stop taking new signals. A position already open stays with its broker-side stop/target — use Flatten all to close them.",
      )
    ) {
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await api.post("/fleet/broadcast/stop")
      refresh()
    } catch (err) {
      fail(err, "Failed to stop the broadcast.")
    } finally {
      setBusy(false)
    }
  }

  const control = async (path: string, label: string, nodeId?: string) => {
    setMsg(null)
    try {
      const q = nodeId ? `?node_id=${encodeURIComponent(nodeId)}` : ""
      const r = await api.post<{ asked: number }>(`/fleet/broadcast/${path}${q}`)
      setMsg({ kind: "ok", text: `${label}: asked ${r.asked} server${r.asked === 1 ? "" : "s"}.` })
      refresh()
    } catch (err) {
      fail(err, `${label} failed.`)
    }
  }

  const flattenAll = () => {
    if (window.confirm("Close EVERY open position on every connected client server now?")) {
      control("flatten", "Flatten")
    }
  }

  /** Only for a leftover server that belongs to NO client (made before servers
   *  were tied to clients). A client's own server is managed on the Clients tab. */
  const removeNode = async (n: FleetNode) => {
    if (!window.confirm(`Remove the unassigned server “${n.name}”? It will be disconnected for good.`)) {
      return
    }
    try {
      await api.del(`/fleet/nodes/${n.node_id}`)
      refresh()
    } catch (err) {
      fail(err, "Failed to remove the server.")
    }
  }

  const cfg = status?.config
  const nodes = status?.nodes ?? []
  const totalDay = nodes.reduce((a, n) => a + (n.day_pnl || 0), 0)
  const dbProblems = nodes.filter((n) => n.db_problem)

  return (
    <div className="space-y-6">
      {/* ── status banner ─────────────────────────────────────────────── */}
      <section
        className={`rounded-lg border p-4 ${
          active ? "border-emerald-700 bg-emerald-950/20" : "border-slate-800"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              {active ? "📡 Broadcasting" : "📡 Broadcast — not running"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {active && cfg
                ? `${cfg.environment} · ${MODE_LABELS[cfg.mode] ?? cfg.mode} · ${cfg.symbols.length} instrument${cfg.symbols.length === 1 ? "" : "s"} · started ${status?.started_at?.replace("T", " ").slice(0, 19)} UTC`
                : "Pick what to trade below and press Start. Connected client servers trade it on their own capital."}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Market data: {status?.feed ?? "—"}
              {status?.feed_simulated && (
                <span className="ml-1 text-amber-400">(simulated prices)</span>
              )}{" "}
              · {status?.connected ?? 0} of {nodes.length} server
              {nodes.length === 1 ? "" : "s"} connected
              {nodes.length > 0 && (
                <>
                  {" "}
                  · clients today{" "}
                  <span className={pnlColor(totalDay)}>{inr(totalDay)}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {active ? (
              <>
                <button
                  onClick={() => control("resync", "Start clients")}
                  className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600"
                  title="Ask every server to start its clients on this run — e.g. after a client has connected their broker."
                >
                  ↻ Start clients now
                </button>
                <button
                  onClick={flattenAll}
                  className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
                >
                  🧹 Flatten all
                </button>
                <button
                  onClick={stop}
                  disabled={busy}
                  className="rounded-lg bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  ⏹️ Stop broadcast
                </button>
              </>
            ) : (
              <button
                onClick={start}
                disabled={busy}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                ▶️ Start broadcast
              </button>
            )}
          </div>
        </div>
        {msg && (
          <p className={`mt-2 text-xs ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {msg.text}
          </p>
        )}
      </section>

      {/* ── what to broadcast ─────────────────────────────────────────── */}
      <section className="rounded-lg border border-slate-800 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-200">What to broadcast</h3>
        <p className="mb-3 text-[11px] text-slate-500">
          Separate from the Controls panel: starting or stopping this never starts or stops your own
          bot. Each client's position size comes from <em>their</em> capital and risk limits — never
          yours.
          {active && " Stop the broadcast to change these."}
        </p>

        <fieldset disabled={active || busy} className="grid gap-4 disabled:opacity-60 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-300">Environment</div>
              {(["Paper", "Live"] as const).map((env) => (
                <label key={env} className="mb-1 flex items-center gap-2 text-sm text-slate-300">
                  <input type="radio" checked={environment === env} onChange={() => setEnvironment(env)} />
                  {env === "Paper" ? "Paper (simulated fills)" : "Live (real orders)"}
                </label>
              ))}
              {environment === "Live" && (
                <p className="text-[11px] text-amber-400">
                  ⚠️ Live tells every connected client account to place real orders.
                </p>
              )}
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-slate-300">Trading mode</div>
              {CLIENT_SELECTABLE_MODES.map((m) => (
                <label key={m} className="mb-1 flex items-center gap-2 text-sm text-slate-300">
                  <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
                  {MODE_LABELS[m]}
                </label>
              ))}
              <p className="text-[11px] text-slate-500">
                Swing isn't offered: it holds overnight, which the client surface isn't built for.
              </p>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-slate-300">Strategy</div>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                value={strategyKey}
                onChange={(e) => setStrategyKey(e.target.value)}
              >
                {strategies.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
              {selected && <p className="mt-1 text-[11px] text-slate-500">{selected.summary}</p>}
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-slate-300">Risk : reward</div>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                value={riskReward}
                onChange={(e) => setRiskReward(Number(e.target.value))}
              >
                <option value={0}>
                  Strategy's own{selected ? ` (1:${selected.params.risk_reward})` : ""}
                </option>
                {rrChoices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Moves the target only. Position size never reads it, so it can't widen a client's risk.
              </p>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-slate-300">🎯 Signal score</div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={0.5}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="flex-1"
                />
                <NumberInput
                  min={0}
                  max={20}
                  step={0.5}
                  value={minScore}
                  onChange={setMinScore}
                  ariaLabel="Signal score"
                  className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {minScore === 0
                  ? `0 = the strategy's own${selected ? ` (${selected.params.cs_min_score})` : ""}.`
                  : `Overriding → ${minScore}.`}{" "}
                Higher = fewer, higher-agreement entries.
                {selected && !selected.uses_min_score && (
                  <span className="text-amber-400"> {selected.name} doesn't use scoring — no effect.</span>
                )}
              </p>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-slate-300">🎯 Exit management</div>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                value={exitStyle}
                onChange={(e) => setExitStyle(e.target.value)}
              >
                {EXIT_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {exitStyle !== "strategy" && exitStyle !== "fixed" && (
                <NumberInput
                  min={0}
                  max={10}
                  step={0.25}
                  value={trailAtrMult}
                  onChange={setTrailAtrMult}
                  placeholder="Trail ×ATR (0 = strategy's own)"
                  ariaLabel="Trail ATR multiple"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                />
              )}
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-slate-300">🔔 Square off</div>
              <label className="mb-1 flex items-start gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={squareOffEnabled}
                  onChange={(e) => setSquareOffEnabled(e.target.checked)}
                />
                Close every open position before the session ends
              </label>
              {squareOffEnabled && (
                <input
                  type="time"
                  value={squareOffTime}
                  onChange={(e) => setSquareOffTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                />
              )}
              <p className="mt-1 text-[11px] text-slate-500">
                {squareOffEnabled
                  ? squareOffTime
                    ? `Flat by ${squareOffTime}.`
                    : "Blank = 15:09 for NSE equity, 23:15 for MCX."
                  : "⚠️ Off — positions can run into the close."}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-slate-300">Segments</div>
            {Object.entries(SEGMENT_LABELS).map(([key, label]) => (
              <label key={key} className="mb-1 flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={segments.includes(key)} onChange={() => toggleSegment(key)} />
                {label}
              </label>
            ))}

            <div className="mb-1 mt-3 text-xs font-medium text-slate-300">
              Instruments ({symbols.length} selected)
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 Search stocks…"
              aria-label="Search instruments"
              className="mb-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-600"
            />
            {visible.length > 0 && (
              <label className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={allVisible} onChange={toggleAllVisible} />
                {allVisible ? "Deselect all" : "Select all"} {visible.length}
                {query.trim() ? " matching" : ""}
              </label>
            )}
            <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-800 p-2">
              {visible.length === 0 ? (
                <p className="py-1 text-xs text-slate-500">
                  {universe.length === 0
                    ? "No instruments in the selected segments."
                    : `No instrument matches “${query.trim()}”.`}
                </p>
              ) : (
                visible.map((i) => (
                  <div key={i.symbol} className="flex items-center gap-2 py-0.5">
                    <label className="flex flex-1 items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={symbols.includes(i.symbol)}
                        onChange={() => toggleSymbol(i.symbol)}
                      />
                      {i.symbol}
                    </label>
                    {i.segment === "MCX_COMMODITY" && (
                      <span className="flex items-center gap-1">
                        <NumberInput
                          min={0}
                          step={1}
                          value={mcxLots[i.symbol] ?? 1}
                          onChange={(n) =>
                            setMcxLots((p) => ({ ...p, [i.symbol]: Math.max(0, Math.floor(n)) }))
                          }
                          ariaLabel={`Lots for ${i.symbol}`}
                          title="Lots per signal (0 = skip). Each client trades this many."
                          className="w-12 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-right text-[11px] text-slate-100"
                        />
                        <span className="text-[10px] text-slate-500">lot</span>
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Commodities trade a fixed number of lots on every client, so check each client's margin
              can carry it. Your ⚙️ per-stock settings for this mode are included automatically.
            </p>
          </div>
        </fieldset>
      </section>

      {/* ── servers ───────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-slate-800 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-200">🖥️ Client servers</h3>
        <p className="mb-3 text-[11px] text-slate-500">
          One server per client, each on its own static IP — created together with the client on the
          👥 Clients tab (that's also where its secret is issued). A server dials in to you and trades
          only its own client. Their broker tokens and keys never leave it.
        </p>

        {dbProblems.length > 0 && (
          <div className="mb-3 rounded-lg border border-red-700/60 bg-red-950/30 p-3 text-xs text-red-200">
            <div className="font-medium">
              ⚠️ {dbProblems.length} server{dbProblems.length === 1 ? "" : "s"} will not show
              trades here
            </div>
            <ul className="mt-1 space-y-0.5">
              {dbProblems.map((n) => (
                <li key={n.node_id}>
                  <span className="font-medium">{n.name}:</span> {n.db_problem}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-red-300/80">
              Every server must use the same MONGO_URI and MONGO_DB_NAME as this one. Until it does,
              that client trades normally but looks idle in the P&amp;L below.
            </p>
          </div>
        )}

        {nodes.length === 0 ? (
          <p className="text-xs text-slate-500">
            No servers yet — each client gets one when you create them on the 👥 Clients tab.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Server</th>
                  <th className="py-1 pr-3 font-medium">Client</th>
                  <th className="py-1 pr-3 font-medium">Link</th>
                  <th className="py-1 pr-3 font-medium">Bot</th>
                  <th className="py-1 pr-3 font-medium">Open</th>
                  <th className="py-1 pr-3 font-medium">Today</th>
                  <th className="py-1 font-medium" />
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {nodes.map((n) => {
                  const running = n.clients.filter((c) => c.running).length
                  const skipped = n.last_start?.skipped ?? []
                  return (
                    <tr key={n.node_id} className="border-t border-slate-800 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-slate-100">{n.name}</div>
                        <div className="text-[10px] text-slate-500">{n.node_id}</div>
                        {n.version && <div className="text-[10px] text-slate-600">v{n.version}</div>}
                      </td>
                      <td className="py-2 pr-3">
                        {n.username ? (
                          <span className="text-slate-100">{n.username}</span>
                        ) : (
                          <span className="text-amber-400">none — trades nobody</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {!n.enabled ? (
                          <span className="text-slate-500">⛔ disabled</span>
                        ) : n.connected ? (
                          <span className="text-emerald-400">🟢 connected</span>
                        ) : (
                          <span className="text-slate-400">⚪ offline</span>
                        )}
                        {n.connected && n.hub_link && (
                          <div className="text-[10px] text-slate-500">{n.hub_link}</div>
                        )}
                        {n.connected && n.db_backend && (
                          <div
                            className={`text-[10px] ${n.db_problem ? "text-red-400" : "text-slate-500"}`}
                          >
                            {n.db_problem ? "⚠️ " : ""}DB: {n.db_backend}
                          </div>
                        )}
                        {n.last_error && (
                          <div className="max-w-56 text-[10px] break-words text-amber-400">{n.last_error}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {n.connected ? (
                          <>
                            {running > 0 ? (
                              <span className="text-emerald-400">🟢 running</span>
                            ) : (
                              <span className="text-slate-500">⏸️ stopped</span>
                            )}
                            {n.environment && (
                              <span className="ml-1 text-[10px] text-slate-500">{n.environment}</span>
                            )}
                            {skipped.map((s) => (
                              <div key={s.username} className="max-w-56 text-[10px] break-words text-amber-400">
                                {s.username}: {s.reason}
                              </div>
                            ))}
                          </>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{Object.keys(n.positions ?? {}).length || "—"}</td>
                      <td className={`py-2 pr-3 ${pnlColor(n.day_pnl)}`}>
                        {n.connected ? inr(n.day_pnl) : "—"}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {n.connected && active && (
                          <>
                            <button
                              onClick={() => control("resync", "Start clients", n.node_id)}
                              className="mr-1 rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
                              title="Start this server's clients on the running broadcast"
                            >
                              ↻
                            </button>
                            <button
                              onClick={() =>
                                window.confirm(`Close every open position on “${n.name}” now?`) &&
                                control("flatten", "Flatten", n.node_id)
                              }
                              className="mr-1 rounded bg-slate-800 px-2 py-1 hover:bg-amber-900"
                              title="Close this server's open positions"
                            >
                              🧹
                            </button>
                          </>
                        )}
                        {!n.username && (
                          <button
                            onClick={() => removeNode(n)}
                            aria-label={`Remove ${n.name}`}
                            title="Remove this unassigned server"
                            className="rounded bg-slate-800 px-2 py-1 hover:bg-red-900"
                          >
                            🗑️
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── how the clients are doing ─────────────────────────────────── */}
      <section className="rounded-lg border border-slate-800 p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-200">📊 Client P&amp;L</h3>
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {(["Paper", "Live"] as const).map((env) => (
              <button
                key={env}
                onClick={() => setPnlEnv(env)}
                className={`px-3 py-1 text-xs ${
                  pnlEnv === env
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                {env}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-[11px] text-slate-500">
          Read from the shared trade database — every client, on whichever server they trade. Realised
          P&amp;L on closed trades; a trade's day is the day it was opened (UTC). Excludes your own bot.
          {status?.hub_db_backend && status.hub_db_backend !== "MongoDB" && (
            <span className="text-red-400">
              {" "}
              ⚠️ This server is not on MongoDB, so it cannot see trades written by other servers.
            </span>
          )}
        </p>

        {pnlError && !pnl && <p className="text-xs text-red-400">Could not load: {pnlError}</p>}

        {pnl && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Today", value: inr(pnl.totals.today_pnl), tone: pnlColor(pnl.totals.today_pnl) },
                { label: "All time", value: inr(pnl.totals.total_pnl), tone: pnlColor(pnl.totals.total_pnl) },
                {
                  label: "Win rate",
                  value: pnl.totals.closed ? `${pnl.totals.win_rate}%` : "—",
                  tone: "text-slate-100",
                },
                {
                  label: "Trading now",
                  value: `${pnl.totals.running} of ${pnl.totals.clients}`,
                  tone: "text-slate-100",
                },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="text-[11px] text-slate-500">{c.label}</div>
                  <div className={`text-lg font-semibold ${c.tone}`}>{c.value}</div>
                </div>
              ))}
            </div>

            {pnl.clients.length === 0 ? (
              <p className="text-xs text-slate-500">No client accounts yet — create them on the Clients tab.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Client</th>
                      <th className="py-1 pr-3 font-medium">Server</th>
                      <th className="py-1 pr-3 font-medium">Bot</th>
                      <th className="py-1 pr-3 text-right font-medium">Today</th>
                      <th className="py-1 pr-3 text-right font-medium">All time</th>
                      <th className="py-1 pr-3 text-right font-medium">Trades</th>
                      <th className="py-1 pr-3 text-right font-medium">Open</th>
                      <th className="py-1 pr-3 text-right font-medium">Win %</th>
                      <th className="py-1 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {pnl.clients.map((c) => (
                      <tr key={c.username} className="border-t border-slate-800">
                        <td className="py-1.5 pr-3">
                          <span className="font-medium text-slate-100">{c.display_name}</span>{" "}
                          <span className="text-[10px] text-slate-500">({c.username})</span>
                          {c.status !== "active" && (
                            <span className="ml-1 text-[10px] text-red-400">disabled</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3">{c.node ?? <span className="text-slate-600">—</span>}</td>
                        <td className="py-1.5 pr-3">
                          {c.running ? (
                            <span className="text-emerald-400">🟢 {c.environment}</span>
                          ) : (
                            <span className="text-slate-500">⏸️</span>
                          )}
                        </td>
                        <td className={`py-1.5 pr-3 text-right ${pnlColor(c.today_pnl)}`}>{inr(c.today_pnl)}</td>
                        <td className={`py-1.5 pr-3 text-right ${pnlColor(c.total_pnl)}`}>{inr(c.total_pnl)}</td>
                        <td className="py-1.5 pr-3 text-right">{c.trades}</td>
                        <td className="py-1.5 pr-3 text-right">{c.open || "—"}</td>
                        <td className="py-1.5 pr-3 text-right">{c.closed ? `${c.win_rate}%` : "—"}</td>
                        <td className="py-1.5 text-right">
                          <button
                            onClick={() =>
                              setStatsFor((cur) =>
                                cur?.username === c.username
                                  ? null
                                  : { username: c.username, displayName: c.display_name },
                              )
                            }
                            className={`rounded px-2 py-0.5 ${
                              statsFor?.username === c.username
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-700 text-slate-100 hover:bg-slate-600"
                            }`}
                          >
                            📊 Trades
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {statsFor && (
              <div className="mt-4">
                <ClientStatsPanel
                  key={statsFor.username}
                  username={statsFor.username}
                  displayName={statsFor.displayName}
                  onClose={() => setStatsFor(null)}
                />
              </div>
            )}

            {pnl.daily.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-1 text-xs font-semibold text-slate-300">By day — all clients together</h4>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-950 text-slate-500">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Date</th>
                        <th className="py-1 pr-3 text-right font-medium">P&amp;L</th>
                        <th className="py-1 pr-3 text-right font-medium">Trades</th>
                        <th className="py-1 pr-3 text-right font-medium">Wins</th>
                        <th className="py-1 text-right font-medium">Clients</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {pnl.daily.map((d) => (
                        <tr key={d.date} className="border-t border-slate-800">
                          <td className="py-1 pr-3">{d.date}</td>
                          <td className={`py-1 pr-3 text-right ${pnlColor(d.pnl)}`}>{inr(d.pnl)}</td>
                          <td className="py-1 pr-3 text-right">{d.trades}</td>
                          <td className="py-1 pr-3 text-right">
                            {d.wins}/{d.closed}
                          </td>
                          <td className="py-1 text-right">{d.clients}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── what it is deciding ───────────────────────────────────────── */}
      {active && (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-800 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Signals generated</h3>
            {(status?.signals ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">Nothing yet — waiting for a setup.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1 pr-2 font-medium">Time</th>
                      <th className="py-1 pr-2 font-medium">Symbol</th>
                      <th className="py-1 pr-2 font-medium">Side</th>
                      <th className="py-1 pr-2 font-medium">Entry</th>
                      <th className="py-1 pr-2 font-medium">Stop</th>
                      <th className="py-1 font-medium">Target</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {status!.signals.map((s, i) => (
                      <tr key={`${s.time}-${s.symbol}-${i}`} className="border-t border-slate-800">
                        <td className="py-1 pr-2">{s.time}</td>
                        <td className="py-1 pr-2 font-medium text-slate-100">{s.symbol}</td>
                        <td className={`py-1 pr-2 ${s.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                          {s.side}
                        </td>
                        <td className="py-1 pr-2">{s.entry}</td>
                        <td className="py-1 pr-2">{s.stop}</td>
                        <td className="py-1">{s.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              No quantity here on purpose — each client's size comes from their own capital.
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Broadcast log</h3>
            <div className="max-h-72 overflow-y-auto font-mono text-[11px] leading-5 text-slate-400">
              {(status?.log ?? []).length === 0 ? (
                <span className="text-slate-600">No events yet.</span>
              ) : (
                status!.log.map((l, i) => <div key={i}>{l}</div>)
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
