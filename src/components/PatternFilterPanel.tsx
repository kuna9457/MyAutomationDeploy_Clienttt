import { useEffect, useMemo, useState } from "react"
import { api, ApiError } from "../lib/api"
import type { PatternRules, PatternStat } from "../lib/types"

/** Choose which candlestick patterns may open a trade.
 *
 *  The picker is ranked by MEASURED performance rather than shown
 *  alphabetically, because the decision this panel exists to support is "which
 *  of these actually made money" — and a 49-item alphabetical list buries that.
 *
 *  Off, or on with an empty list, means no filtering at all. That is the same
 *  contract the server enforces (pattern_config.PatternRules.is_active), so a
 *  half-built list can never quietly halt trading.
 */
export default function PatternFilterPanel({
  mode,
  strategyKey,
  disabled,
}: {
  mode: string
  strategyKey: string
  disabled?: boolean
}) {
  const [catalogue, setCatalogue] = useState<string[]>([])
  const [filterable, setFilterable] = useState<string[]>([])
  const [rules, setRules] = useState<PatternRules>({ enabled: false, allowed: [] })
  const [stats, setStats] = useState<PatternStat[]>([])
  const [environment, setEnvironment] = useState<"Paper" | "Live">("Paper")
  const [custom, setCustom] = useState("")
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ patterns: string[]; strategies: string[] }>("/admin/pattern-catalogue")
      .then((r) => {
        setCatalogue(r.patterns)
        setFilterable(r.strategies)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    api
      .get<Record<string, PatternRules>>(`/admin/pattern-config?mode=${mode}`)
      .then((all) => setRules(all[strategyKey] ?? { enabled: false, allowed: [] }))
      .catch(() => setRules({ enabled: false, allowed: [] }))
  }, [mode, strategyKey])

  useEffect(() => {
    api
      .get<{ patterns: PatternStat[] }>(
        `/admin/pattern-stats?environment=${environment}&strategy=${strategyKey}&mode=${mode}`,
      )
      .then((r) => setStats(r.patterns))
      .catch(() => setStats([]))
  }, [environment, strategyKey, mode])

  const statOf = useMemo(() => {
    const m = new Map<string, PatternStat>()
    for (const s of stats) m.set(s.pattern, s)
    return m
  }, [stats])

  // Catalogue plus anything seen in the trade log or already allowed — a
  // pattern from another engine (chart patterns, market structure) can appear
  // in entry_reason, and a name you added by hand must not vanish from view.
  const universe = useMemo(() => {
    const all = new Set<string>(catalogue)
    for (const s of stats) all.add(s.pattern)
    for (const a of rules.allowed) all.add(a)
    const list = [...all]
    // Measured first, best PnL down; unmeasured after, alphabetically.
    list.sort((a, b) => {
      const sa = statOf.get(a)
      const sb = statOf.get(b)
      if (sa && sb) return sb.pnl - sa.pnl
      if (sa) return -1
      if (sb) return 1
      return a.localeCompare(b)
    })
    return list
  }, [catalogue, stats, rules.allowed, statOf])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? universe.filter((p) => p.toLowerCase().includes(q)) : universe
  }, [universe, query])

  const save = async (next: PatternRules) => {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await api.put("/admin/pattern-config", {
        strategy_key: strategyKey,
        mode,
        enabled: next.enabled,
        allowed: next.allowed,
      })
      setRules(next)
      setMsg(
        next.enabled && next.allowed.length
          ? `Filtering on — ${next.allowed.length} pattern(s) may trade.`
          : "Saved. Filtering is OFF; every pattern still counts.",
      )
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.")
    } finally {
      setBusy(false)
    }
  }

  const toggle = (p: string) =>
    save({
      ...rules,
      allowed: rules.allowed.includes(p)
        ? rules.allowed.filter((x) => x !== p)
        : [...rules.allowed, p],
    })

  const addCustom = () => {
    const name = custom.trim()
    if (!name || rules.allowed.includes(name)) return
    setCustom("")
    save({ ...rules, allowed: [...rules.allowed, name] })
  }

  const allowProfitable = () => {
    const winners = stats
      .filter((s) => s.pnl > 0 && s.trades >= 5)
      .map((s) => s.pattern)
    save({ ...rules, allowed: [...new Set([...rules.allowed, ...winners])] })
  }

  if (!filterable.includes(strategyKey)) {
    return (
      <p className="text-[11px] text-slate-500">
        {strategyKey || "This strategy"} does not use candlestick patterns, so a
        pattern filter would do nothing here.
      </p>
    )
  }

  const lock = busy || disabled
  const active = rules.enabled && rules.allowed.length > 0

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 text-slate-300">
        <input
          type="checkbox"
          className="mt-1"
          checked={rules.enabled}
          disabled={lock}
          onChange={(e) => save({ ...rules, enabled: e.target.checked })}
        />
        <span className="text-xs">
          Only trade the ticked patterns
          <span className="block text-[11px] text-slate-500">
            Off by default. With this on, a signal only fires if an allowed
            pattern is part of the evidence — everything else is ignored. It can
            only make the bot trade LESS, never differently sized.
          </span>
        </span>
      </label>

      {rules.enabled && rules.allowed.length === 0 && (
        <p className="rounded border border-amber-800 bg-amber-950/40 p-2 text-[11px] text-amber-300">
          Nothing ticked yet, so filtering is still OFF and every pattern counts.
          Tick at least one to make this bind.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patterns…"
          className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
        />
        <select
          value={environment}
          onChange={(e) => setEnvironment(e.target.value as "Paper" | "Live")}
          title="Which book the PnL figures come from"
          className="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[11px] text-slate-100"
        >
          <option value="Paper">Paper stats</option>
          <option value="Live">Live stats</option>
        </select>
        <button
          onClick={allowProfitable}
          disabled={lock || stats.length === 0}
          title="Tick every pattern with positive PnL on at least 5 trades"
          className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 disabled:opacity-40"
        >
          + profitable
        </button>
        <button
          onClick={() => save({ ...rules, allowed: [] })}
          disabled={lock || rules.allowed.length === 0}
          className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 disabled:opacity-40"
        >
          clear
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto rounded border border-slate-800">
        {shown.map((p) => {
          const s = statOf.get(p)
          const on = rules.allowed.includes(p)
          return (
            <label
              key={p}
              className={`flex items-center gap-2 border-b border-slate-900 px-2 py-1 last:border-0 ${
                on ? "bg-sky-950/40" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={lock}
                onChange={() => toggle(p)}
              />
              <span className="flex-1 text-[11px] text-slate-200">{p}</span>
              {s ? (
                <span className="shrink-0 text-[10px]">
                  <span className={s.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                    ₹{s.pnl.toLocaleString("en-IN")}
                  </span>
                  <span className="ml-1 text-slate-500">
                    {s.trades}t · {s.win_rate}%
                    {s.solo_trades > 0 && ` · solo ${s.solo_trades}`}
                  </span>
                </span>
              ) : (
                <span className="shrink-0 text-[10px] text-slate-600">no trades yet</span>
              )}
            </label>
          )
        })}
        {shown.length === 0 && (
          <p className="px-2 py-2 text-[11px] text-slate-500">No match.</p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustom()}
          placeholder="Add a pattern by name…"
          className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
        />
        <button
          onClick={addCustom}
          disabled={lock || !custom.trim()}
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
        >
          Add
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        Names are matched exactly against what the engine emits, so a typo simply
        never matches and that pattern never trades. Anything showing “no trades
        yet” has not appeared in your {environment.toLowerCase()} book — which
        may mean it is rare, or that the name is wrong.
      </p>

      {active && (
        <p className="text-[11px] text-emerald-400">
          ✅ Active: {rules.allowed.length} pattern(s) may open a trade on{" "}
          {strategyKey} / {mode}.
        </p>
      )}
      {msg && <p className="text-[11px] text-slate-400">{msg}</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
