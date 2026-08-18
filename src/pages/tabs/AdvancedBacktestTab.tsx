import { useEffect, useRef, useState } from "react"
import DataTable from "../../components/DataTable"
import SymbolBucketBar from "../../components/SymbolBucketBar"
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
  // Read from the server rather than hardcoded, so the form can never
  // advertise a different ceiling from the one that is enforced.
  const [maxSymbols, setMaxSymbols] = useState(150)
  const poll = useRef<number | null>(null)

  useEffect(() => {
    api.get<Instrument[]>("/config/instruments").then(setInstruments).catch(() => {})
    api
      .get<{ max_symbols: number }>("/advanced-backtest/limits")
      .then((l) => setMaxSymbols(l.max_symbols))
      .catch(() => {})
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
    const b = results?.bucket
    if (!b) return
    // Pairings, not two flat lists: pasting {symbols} x {patterns} would
    // switch on every unvalidated cell between them.
    const lines = b.pairs
      .map(
        (p) =>
          `${p.symbol} + ${p.pattern} (OOS ${p.oos_return}% vs unfiltered ${p.baseline_oos_return}%, edge ${p.edge})`,
      )
      .join("\n")
    const safe = b.safe_plan
      ? `\n\nSafe to run as-is (one pattern, no cross-product):\n  Pattern: ${b.safe_plan.pattern}\n  Symbols: ${b.safe_plan.symbols.join(", ")}`
      : ""
    void navigator.clipboard?.writeText(
      `Validated pairings:\n` + lines + safe,
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
              Symbols ({symbols.length} selected, max {maxSymbols}) — equity only
            </span>
            <span className="flex gap-2">
              <button
                onClick={() =>
                  setSymbols(shown.slice(0, maxSymbols).map((i) => i.symbol))
                }
                className="text-[11px] text-sky-400 hover:underline"
              >
                select all shown
              </button>
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
          <SymbolBucketBar
            selected={symbols}
            onLoad={setSymbols}
            known={new Set(equity.map((i) => i.symbol))}
            disabled={job?.status === "running"}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbols…"
            className="mb-1 mt-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
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
            disabled={
              job?.status === "running" ||
              symbols.length === 0 ||
              symbols.length > maxSymbols
            }
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
          {symbols.length > maxSymbols && (
            <span className="text-[11px] text-red-400">
              {symbols.length} selected — the limit is {maxSymbols}. Deselect{" "}
              {symbols.length - maxSymbols} or raise ADV_BACKTEST_MAX_SYMBOLS.
            </span>
          )}
          {symbols.length > 40 && symbols.length <= maxSymbols && (
            <span className="text-[11px] text-amber-400">
              Large search. Symbols not cached yet are downloaded once — the
              first run on a fresh set is the slow one.
            </span>
          )}
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

      {results?.bucket && results.bucket.pairs.length > 0 && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-emerald-300">
              Recommended pairings
            </h3>
            <button
              onClick={copyBucket}
              className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
            >
              {copied ? "copied" : "copy pairings"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{results.bucket.why}</p>

          <ul className="mt-2 space-y-0.5">
            {results.bucket.pairs.map((p) => (
              <li key={p.symbol + "|" + p.pattern} className="text-xs text-slate-200">
                <span className="font-semibold">{p.symbol}</span>
                <span className="text-slate-500"> + </span>
                {p.pattern}
                <span className="ml-2 text-slate-500">
                  OOS {p.oos_return}% vs unfiltered {p.baseline_oos_return}%
                </span>
                <span className="ml-1 text-emerald-400">edge +{p.edge}</span>
              </li>
            ))}
          </ul>

          {results.bucket.safe_plan && (
            <div className="mt-3 rounded border border-sky-900 bg-sky-950/40 p-2">
              <p className="text-[11px] font-semibold text-sky-300">
                Safe to apply as-is
              </p>
              <p className="mt-0.5 text-xs text-slate-200">
                Pattern <strong>{results.bucket.safe_plan.pattern}</strong> with{" "}
                {results.bucket.safe_plan.symbols.join(", ")}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                One pattern plus its own symbols is the only shape today&apos;s
                settings express exactly &mdash; the pattern filter is per
                strategy, so a single pattern cannot create an unvalidated
                pairing.
              </p>
            </div>
          )}

          {results.bucket.conflicts.length > 0 && (
            <div className="mt-3 rounded border border-red-900 bg-red-950/40 p-2">
              <p className="text-[11px] font-semibold text-red-300">
                Do NOT paste the symbol and pattern lists separately
              </p>
              <p className="mt-0.5 text-[11px] text-slate-300">
                That enables every combination between them, including these
                this search already rejected:
              </p>
              <ul className="mt-1 space-y-0.5">
                {results.bucket.conflicts.map((c) => (
                  <li
                    key={c.symbol + "|" + c.pattern}
                    className="text-[11px] text-red-300"
                  >
                    {c.symbol} + {c.pattern} &mdash; {c.verdict}
                    {c.oos_return !== null && " (" + c.oos_return + "% OOS)"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results.bucket.dropped_no_edge.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] text-slate-400">
                {results.bucket.dropped_no_edge.length} profitable combination(s)
                left out &mdash; the unfiltered symbol did better
              </summary>
              <ul className="mt-1 space-y-0.5">
                {results.bucket.dropped_no_edge.map((d) => (
                  <li
                    key={d.symbol + "|" + d.pattern}
                    className="text-[11px] text-slate-400"
                  >
                    {d.symbol} + {d.pattern}: {d.oos_return}% OOS, but unfiltered
                    beat it by {Math.abs(d.edge ?? 0)} points &mdash; leave this
                    one alone.
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="mt-2 text-[11px] text-slate-500">
            Nothing has been applied. These are pairings, not two independent
            lists &mdash; apply them as pairs.
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
                key: "base",
                header: "Unfiltered OOS %",
                render: (r) =>
                  r.baseline_oos_return === null ? "—" : r.baseline_oos_return,
              },
              {
                key: "edge",
                header: "Edge",
                render: (r) =>
                  r.edge === null ? (
                    "—"
                  ) : (
                    <span
                      className={r.edge > 0 ? "text-emerald-400" : "text-red-400"}
                      title={
                        r.edge > 0
                          ? "The filter beat trading this symbol unfiltered."
                          : "Trading this symbol UNFILTERED did better — the filter costs you here."
                      }
                    >
                      {r.edge > 0 ? "+" : ""}
                      {r.edge}
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
            Per-symbol baseline (unfiltered)
          </h4>
          <p className="mb-1 text-[11px] text-slate-500">
            The <strong>Out-of-sample</strong> column is the like-for-like
            comparison — the same symbol with no pattern filter, over the same
            window a combination is scored on. The full-window column spans both
            halves and is only context; comparing it against a combination's OOS
            return would compare two different lengths of time.
          </p>
          <DataTable
            rows={results.symbols}
            rowKey={(r) => r.symbol}
            empty=""
            columns={[
              { key: "s", header: "Symbol", render: (r) => r.symbol },
              { key: "t", header: "Trades", render: (r) => r.trades },
              {
                key: "r",
                header: "Full-window %",
                render: (r) => (
                  <span
                    className={r.return_pct >= 0 ? "text-emerald-400" : "text-red-400"}
                  >
                    {r.return_pct}
                  </span>
                ),
              },
              {
                key: "boos",
                header: "Out-of-sample %",
                render: (r) =>
                  r.baseline_oos_return === null ? (
                    "—"
                  ) : (
                    <span
                      className={
                        r.baseline_oos_return >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }
                    >
                      {r.baseline_oos_return}
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
