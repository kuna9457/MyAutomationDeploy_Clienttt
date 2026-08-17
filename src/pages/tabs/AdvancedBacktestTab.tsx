import { useEffect, useRef, useState } from "react"
import DataTable from "../../components/DataTable"
import { api, ApiError } from "../../lib/api"
import type {
  Instrument,
  SearchCombo,
  SearchJob,
  StrategyInfo,
} from "../../lib/types"

const MODES = ["Intraday", "Swing", "Scalper"] as const
const RR_CHOICES = [0, 1, 1.5, 2, 2.5, 3]

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const VERDICT: Record<string, { label: string; cls: string; hint: string }> = {
  holds: {
    label: "✅ holds",
    cls: "text-emerald-400",
    hint: "Profitable on the held-back half, on a usable sample.",
  },
  promising: {
    label: "🟡 promising",
    cls: "text-amber-400",
    hint: "Positive out of sample but too few trades to rely on.",
  },
  overfit: {
    label: "⚠️ overfit",
    cls: "text-red-400",
    hint: "Worked where it was chosen, collapsed where it wasn't.",
  },
  thin: { label: "· thin", cls: "text-slate-500", hint: "Too few trades to judge." },
  fails: { label: "❌ fails", cls: "text-red-400", hint: "Lost money out of sample." },
  unverified: {
    label: "—",
    cls: "text-slate-600",
    hint: "Screened only; not in the verified shortlist.",
  },
}

export default function AdvancedBacktestTab() {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [strategies, setStrategies] = useState<StrategyInfo[]>([])
  const [symbols, setSymbols] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<(typeof MODES)[number]>("Intraday")
  const [strategyKey, setStrategyKey] = useState("candlestick_engine")
  const [start, setStart] = useState(isoDaysAgo(365))
  const [end, setEnd] = useState(isoDaysAgo(0))
  const [capital, setCapital] = useState(100000)
  const [riskReward, setRiskReward] = useState(2)
  const [split, setSplit] = useState(0.7)
  const [job, setJob] = useState<SearchJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [onlyKeepers, setOnlyKeepers] = useState(false)
  const [copied, setCopied] = useState(false)
  const poll = useRef<number | null>(null)

  useEffect(() => {
    api.get<Instrument[]>("/config/instruments").then(setInstruments).catch(() => {})
  }, [])

  useEffect(() => {
    api
      .get<StrategyInfo[]>(`/config/strategies?mode=${mode}`)
      .then(setStrategies)
      .catch(() => {})
  }, [mode])

  // Poll only while a search is running, and always clear on unmount — a timer
  // left behind would keep hitting the API from a page nobody is looking at.
  useEffect(() => {
    if (!job || job.status !== "running") {
      if (poll.current) window.clearInterval(poll.current)
      poll.current = null
      return
    }
    poll.current = window.setInterval(async () => {
      try {
        setJob(await api.get<SearchJob>(`/advanced-backtest/jobs/${job.id}`))
      } catch {
        /* transient; the next tick retries */
      }
    }, 1500)
    return () => {
      if (poll.current) window.clearInterval(poll.current)
      poll.current = null
    }
  }, [job?.id, job?.status])

  const equity = instruments.filter((i) => i.segment === "NSE_EQUITY")
  const shown = query.trim()
    ? equity.filter((i) => i.symbol.includes(query.trim().toUpperCase()))
    : equity

  const startSearch = async () => {
    setError(null)
    setCopied(false)
    try {
      const { job_id } = await api.post<{ job_id: string }>(
        "/advanced-backtest/start",
        {
          symbols,
          start,
          end,
          capital,
          mode,
          strategy_key: strategyKey,
          risk_reward: riskReward,
          split,
        },
      )
      setJob(await api.get<SearchJob>(`/advanced-backtest/jobs/${job_id}`))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start the search.")
    }
  }

  const cancel = async () => {
    if (!job) return
    try {
      await api.post(`/advanced-backtest/jobs/${job.id}/cancel`)
    } catch {
      /* it may have finished between render and click */
    }
  }

  const results = job?.results ?? null
  const combos: SearchCombo[] = results
    ? onlyKeepers
      ? results.combos.filter((c) => c.verdict === "holds" || c.verdict === "promising")
      : results.combos.filter((c) => c.verdict !== "unverified")
    : []
  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0
  const estimate = symbols.length
    ? `${symbols.length} symbol${symbols.length === 1 ? "" : "s"} → about ${
        Math.max(1, Math.round((symbols.length * 1.8 + 25 * 3.6) / 5 / 6) * 6
        )}s`
    : "pick some symbols"

  const copyBucket = () => {
    if (!results?.bucket) return
    void navigator.clipboard?.writeText(
      `Symbols: ${results.bucket.symbols.join(", ")}\n` +
        `Patterns: ${results.bucket.patterns.join(", ")}`,
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">
          🔬 Advanced Backtesting — combination search
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Finds which <strong>symbol + pattern</strong> pairings actually work
          for one strategy, so a stock bucket is chosen on evidence. Everything
          else — RR, signal score, session hours, direction — is held fixed at
          what you set here; only the symbol and the pattern vary.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-xs text-slate-400">
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as (typeof MODES)[number])}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            >
              {MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Strategy
            <select
              value={strategyKey}
              onChange={(e) => setStrategyKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            >
              {strategies.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Risk : reward
            <select
              value={riskReward}
              onChange={(e) => setRiskReward(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            >
              {RR_CHOICES.map((r) => (
                <option key={r} value={r}>
                  {r === 0 ? "strategy default" : `1:${r}`}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Capital (₹)
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            From
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            To
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Choose on first
            <select
              value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            >
              <option value={0.6}>60% (score on last 40%)</option>
              <option value={0.7}>70% (score on last 30%)</option>
              <option value={0.8}>80% (score on last 20%)</option>
            </select>
          </label>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Symbols ({symbols.length} selected, max 40) — equity only
            </span>
            <span className="flex gap-2">
              <button
                onClick={() => setSymbols(shown.slice(0, 20).map((i) => i.symbol))}
                className="text-[11px] text-sky-400 hover:underline"
              >
                first 20
              </button>
              <button
                onClick={() => setSymbols([])}
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                clear
              </button>
            </span>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbols…"
            className="mb-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
          />
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {shown.slice(0, 120).map((i) => (
              <button
                key={i.symbol}
                onClick={() =>
                  setSymbols((p) =>
                    p.includes(i.symbol)
                      ? p.filter((x) => x !== i.symbol)
                      : [...p, i.symbol],
                  )
                }
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  symbols.includes(i.symbol)
                    ? "bg-emerald-900 text-emerald-200"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {i.symbol}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={startSearch}
            disabled={job?.status === "running" || symbols.length === 0}
            className="rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            {job?.status === "running" ? "Searching…" : "🔬 Run search"}
          </button>
          {job?.status === "running" && (
            <button
              onClick={cancel}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
          )}
          <span className="text-[11px] text-slate-500">{estimate}</span>
        </div>

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {job && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-300">
              {job.status === "running"
                ? `${job.label} — ${job.done}/${job.total}`
                : `${job.status} in ${job.elapsed}s`}
            </span>
            <span className="text-slate-500">
              {results &&
                `screened ${results.screened} cells · verified ${results.verified} · split ${results.split_date}`}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-800">
            <div
              className={`h-full transition-all ${
                job.status === "error" ? "bg-red-600" : "bg-indigo-500"
              }`}
              style={{ width: `${job.status === "running" ? pct : 100}%` }}
            />
          </div>
          {job.error && <p className="mt-2 text-xs text-red-400">{job.error}</p>}
        </div>
      )}

      {results?.bucket && results.bucket.combinations.length > 0 && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-emerald-300">
              🪣 Recommended bucket
            </h3>
            <button
              onClick={copyBucket}
              className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
            >
              {copied ? "copied ✓" : "copy symbols + patterns"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{results.bucket.why}</p>
          <p className="mt-2 text-xs text-slate-200">
            <span className="text-slate-500">Symbols: </span>
            {results.bucket.symbols.join(", ")}
          </p>
          <p className="text-xs text-slate-200">
            <span className="text-slate-500">Patterns: </span>
            {results.bucket.patterns.join(", ")}
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            Nothing has been applied. Paste these into the strategy board and the
            pattern filter yourself, once you are satisfied.
          </p>
        </div>
      )}

      {results && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-200">
              Combinations ({combos.length})
            </h3>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <input
                type="checkbox"
                checked={onlyKeepers}
                onChange={(e) => setOnlyKeepers(e.target.checked)}
              />
              only the ones worth keeping
            </label>
          </div>
          <DataTable
            rows={combos}
            rowKey={(r) => `${r.symbol}|${r.pattern}`}
            empty="Nothing survived verification. Widen the window or add symbols."
            columns={[
              { key: "sym", header: "Symbol", render: (r) => r.symbol },
              { key: "pat", header: "Pattern", render: (r) => r.pattern },
              {
                key: "is",
                header: "In-sample %",
                render: (r) => (r.is_return === null ? "—" : r.is_return),
              },
              {
                key: "oos",
                header: "Out-of-sample %",
                render: (r) =>
                  r.oos_return === null ? (
                    "—"
                  ) : (
                    <span
                      className={
                        r.oos_return >= 0 ? "text-emerald-400" : "text-red-400"
                      }
                    >
                      {r.oos_return}
                    </span>
                  ),
              },
              {
                key: "n",
                header: "OOS trades",
                render: (r) => (
                  <span className={r.oos_trades < 30 ? "text-amber-400" : ""}>
                    {r.oos_trades}
                  </span>
                ),
              },
              {
                key: "pf",
                header: "PF",
                render: (r) => r.oos_profit_factor ?? "—",
              },
              {
                key: "v",
                header: "Verdict",
                render: (r) => (
                  <span
                    className={VERDICT[r.verdict]?.cls ?? "text-slate-400"}
                    title={r.note || VERDICT[r.verdict]?.hint}
                  >
                    {VERDICT[r.verdict]?.label ?? r.verdict}
                  </span>
                ),
              },
            ]}
          />
          <p className="mt-2 text-xs text-slate-500">
            Ranked on the <strong>out-of-sample</strong> half — the part the
            choice was not made on — discounted for thin samples and for
            collapse between the two halves. A high in-sample number with a weak
            out-of-sample one is marked ⚠️ overfit; that is the column doing its
            job, not a failure. No slippage or brokerage is modelled anywhere,
            so every figure here is optimistic.
          </p>

          <h4 className="mb-1 mt-4 text-xs font-semibold text-slate-300">
            Per-symbol baseline (unfiltered — what each combination must beat)
          </h4>
          <DataTable
            rows={results.symbols}
            rowKey={(r) => r.symbol}
            empty=""
            columns={[
              { key: "s", header: "Symbol", render: (r) => r.symbol },
              { key: "t", header: "Trades", render: (r) => r.trades },
              {
                key: "r",
                header: "Return %",
                render: (r) => (
                  <span
                    className={r.return_pct >= 0 ? "text-emerald-400" : "text-red-400"}
                  >
                    {r.return_pct}
                  </span>
                ),
              },
              { key: "w", header: "Win %", render: (r) => r.win_rate },
              { key: "src", header: "Data", render: (r) => r.error || r.source },
            ]}
          />
        </div>
      )}
    </div>
  )
}
