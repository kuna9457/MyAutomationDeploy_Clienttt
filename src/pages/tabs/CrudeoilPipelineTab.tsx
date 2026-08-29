import { useEffect, useState } from "react"
import { api, ApiError } from "../../lib/api"

/**
 * Frontend for the isolated `crudeoil_pipeline` package.
 *
 * Deliberately its own tab rather than an entry in the existing Backtest tab:
 * the pipeline reports things no other strategy does (a GO/NO-GO gate, an
 * in-sample vs out-of-sample split, Monte-Carlo sequence risk), and folding
 * those into the shared results panel would either clutter it for every other
 * strategy or, worse, let a pipeline result be read with the shared panel's
 * assumptions.
 *
 * The single most important thing this UI does is refuse to let an IN-SAMPLE
 * number be mistaken for a validated one — see the banner below.
 */

type Metrics = Record<string, number | string | null>

interface Fold {
  fold: number
  test_start: string
  test_end: string
  trades: number | null
  net_pnl: number | null
  win_rate: number | null
  pf: number | null
  chosen: Record<string, number>
}

interface Gate8 {
  checks: Record<string, boolean | null>
  passed: boolean
  verdict: string
  note: string
}

interface Result {
  metrics: Metrics
  is_out_of_sample: boolean
  folds: Fold[]
  stable_across_folds: boolean | null
  monte_carlo: Record<string, number> | null
  gate8: Gate8 | null
  equity_curve: { t: string; equity: number }[]
  trades: Record<string, unknown>[]
  data_quality: string
}

interface Info {
  available: boolean
  symbols?: string[]
  strategies?: { key: string; name: string; primary: boolean; summary: string }[]
  cost_hurdle_points?: Record<string, number>
  notes?: string[]
  error?: string
}

interface DataStatus {
  ok: boolean
  data_dir?: string
  files?: string[]
  bars?: number
  start?: string
  end?: string
  message?: string
  error?: string
}

const num = (v: unknown, d = 2) =>
  typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : "—"

export default function CrudeoilPipelineTab() {
  const [info, setInfo] = useState<Info | null>(null)
  const [status, setStatus] = useState<DataStatus | null>(null)
  const [res, setRes] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const [symbol, setSymbol] = useState("CRUDEOILM")
  const [capital, setCapital] = useState(1000000)
  const [walkForward, setWalkForward] = useState(true)
  const [trainDays, setTrainDays] = useState(30)
  const [testDays, setTestDays] = useState(10)
  const [timeframe, setTimeframe] = useState(5)
  const [strats, setStrats] = useState({
    us_open_momentum: true,
    opening_range_breakout: true,
    eia_event: true,
    vwap_meanrev: false,
  })
  const [atrStop, setAtrStop] = useState(1.25)
  const [targetR, setTargetR] = useState(2.0)
  const [trail, setTrail] = useState(1.5)
  const [beAtR, setBeAtR] = useState(1.0)
  const [riskPct, setRiskPct] = useState(1.0)

  // lib/api is a fetch wrapper: api.get<T>() resolves to T directly, NOT to
  // an axios-style { data: T }. Unwrapping a .data here would set state to
  // undefined and blank the page on first render.
  useEffect(() => {
    api.get<Info>("/crudeoil/info").then(setInfo).catch(() => setInfo(null))
  }, [])
  useEffect(() => {
    api
      .get<DataStatus>(`/crudeoil/data-status?symbol=${symbol}`)
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [symbol])

  async function run() {
    setBusy(true)
    setErr("")
    setRes(null)
    try {
      const data = await api.post<Result>("/crudeoil/backtest", {
        symbol,
        initial_capital: capital,
        timeframe_minutes: timeframe,
        atr_stop_mult: atrStop,
        target_r: targetR,
        trail_atr_mult: trail,
        breakeven_at_r: beAtR,
        risk_pct_per_trade: riskPct,
        ...strats,
        walk_forward: walkForward,
        train_days: trainDays,
        test_days: testDays,
        monte_carlo: true,
      })
      setRes(data)
    } catch (e: unknown) {
      // ApiError already carries the FastAPI `detail` as its message.
      setErr(e instanceof ApiError ? e.message
             : e instanceof Error ? e.message : "request failed")
    } finally {
      setBusy(false)
    }
  }

  const m = res?.metrics
  const gate = res?.gate8

  return (
    <div className="space-y-5">
      {/* ---- what this is ------------------------------------------------ */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="mb-1 text-lg font-semibold text-slate-100">
          🛢️ Crudeoil Pipeline
        </h2>
        <p className="text-sm text-slate-400">
          A self-contained MCX crude research pipeline: DST-aware session
          calendar, leak-free features, US-open momentum + opening-range
          breakout + an EIA event overlay, ATR risk, lot-aware sizing and a{" "}
          <span className="text-slate-200">verified cost model</span>. Every
          number below is <span className="text-slate-200">net of costs</span>.
        </p>
        {info?.cost_hurdle_points && (
          <p className="mt-2 text-xs text-slate-500">
            Round-trip cost hurdle:{" "}
            {Object.entries(info.cost_hurdle_points).map(([k, v]) => (
              <span key={k} className="mr-3">
                <span className="text-slate-300">{k}</span> {v} pts
              </span>
            ))}
            — a target that cannot clear this is refused before the trade is placed.
          </p>
        )}
        {info && !info.available && (
          <p className="mt-2 text-sm text-rose-400">
            Pipeline unavailable: {info.error}
          </p>
        )}
      </section>

      {/* ---- data status -------------------------------------------------- */}
      {status && !status.ok && (
        <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          <div className="font-medium">No data for {symbol}</div>
          <div className="mt-1 text-xs text-amber-200/80">
            {status.message ?? status.error}
          </div>
        </div>
      )}
      {status?.ok && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 text-xs text-slate-400">
          {status.bars?.toLocaleString()} bars · {status.start?.slice(0, 10)} →{" "}
          {status.end?.slice(0, 10)} · {status.files?.join(", ")}
        </div>
      )}

      {/* ---- controls ----------------------------------------------------- */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Field label="Symbol">
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          >
            {(info?.symbols ?? ["CRUDEOILM", "CRUDEOIL"]).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Initial capital (₹)">
          <input
            type="number"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
          />
        </Field>
        <Field label="Timeframe">
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={timeframe}
            onChange={(e) => setTimeframe(Number(e.target.value))}
          >
            <option value={5}>5-minute (design timeframe)</option>
            <option value={15}>15-minute</option>
            <option value={30}>30-minute</option>
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            Look-backs are declared in minutes and converted to bars, so
            changing this keeps every rule the same length of market time.
            Finer bars than the stored data will error rather than silently
            run coarser.
          </p>
        </Field>
        <Field label="Risk % per trade">
          <input
            type="number"
            step={0.25}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value))}
          />
        </Field>
        <Field label="ATR stop ×">
          <input type="number" step={0.25} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={atrStop} onChange={(e) => setAtrStop(Number(e.target.value))} />
        </Field>
        <Field label="Target (R)">
          <input type="number" step={0.5} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={targetR} onChange={(e) => setTargetR(Number(e.target.value))} />
        </Field>
        <Field label="Trail ATR × (99 = off)">
          <input type="number" step={0.5} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={trail} onChange={(e) => setTrail(Number(e.target.value))} />
        </Field>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
        <div className="mb-2 text-sm font-medium text-slate-300">Strategies</div>
        <div className="flex flex-wrap gap-4">
          {info?.strategies?.map((s) => (
            <label key={s.key} className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={(strats as Record<string, boolean>)[s.key] ?? false}
                onChange={(e) =>
                  setStrats((p) => ({ ...p, [s.key]: e.target.checked }))
                }
              />
              <span>
                {s.name}
                {s.primary && (
                  <span className="ml-1 rounded bg-sky-900/60 px-1 text-[10px] text-sky-300">
                    primary
                  </span>
                )}
                <span className="block max-w-xs text-[11px] text-slate-500">
                  {s.summary}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* ---- validation mode: the single most important control ----------- */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={walkForward}
            onChange={(e) => setWalkForward(e.target.checked)}
          />
          <span className="font-medium">
            Walk-forward validation (out-of-sample)
          </span>
        </label>
        <p className="mt-1 text-[11px] text-slate-500">
          Parameters are chosen on each training window and scored on the
          <em> next, unseen </em> window. Turn this OFF and you get a single
          pass over the whole span — which is{" "}
          <span className="text-amber-300">in-sample by construction</span> and
          cannot tell you whether the strategy works.
        </p>
        {walkForward && (
          <div className="mt-2 flex gap-3">
            <Field label="Train days">
              <input type="number" className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                value={trainDays} onChange={(e) => setTrainDays(Number(e.target.value))} />
            </Field>
            <Field label="Test days">
              <input type="number" className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                value={testDays} onChange={(e) => setTestDays(Number(e.target.value))} />
            </Field>
          </div>
        )}
      </section>

      <button
        onClick={run}
        disabled={busy || (status ? !status.ok : false)}
        className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {busy ? "Running…" : walkForward ? "Run walk-forward" : "Run backtest"}
      </button>

      {err && (
        <div className="rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">
          {err}
        </div>
      )}

      {/* ---- results ------------------------------------------------------ */}
      {res && m && (
        <div className="space-y-4">
          {/* The banner that stops an in-sample number being misread. */}
          <div
            className={`rounded-lg border p-3 text-sm ${
              res.is_out_of_sample
                ? "border-slate-700 bg-slate-900/50 text-slate-300"
                : "border-amber-700/60 bg-amber-950/30 text-amber-200"
            }`}
          >
            {res.is_out_of_sample ? (
              <>
                <span className="font-medium">Out-of-sample.</span> Concatenated
                test windows only — parameters for each were chosen without
                seeing it.
              </>
            ) : (
              <>
                <span className="font-medium">⚠ In-sample.</span> This is one
                pass over the whole span, so it is not evidence the strategy
                works. Enable walk-forward before believing any of it.
              </>
            )}
          </div>

          {gate && (
            <div
              className={`rounded-lg border p-3 ${
                gate.passed
                  ? "border-emerald-700 bg-emerald-950/30"
                  : "border-rose-800 bg-rose-950/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-lg font-bold ${
                    gate.passed ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  GATE 8: {gate.verdict}
                </span>
                <span className="text-xs text-slate-400">
                  (go/no-go for live trading)
                </span>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs">
                {Object.entries(gate.checks).map(([k, v]) => (
                  <li key={k} className="text-slate-300">
                    {v === null ? "○" : v ? "✅" : "❌"} {k.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">{gate.note}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Trades" value={num(m.trades, 0)} />
            <Stat label="Win rate" value={`${num(m.win_rate)}%`} />
            <Stat
              label="Net P&L"
              value={`₹${num(m.net_pnl, 0)}`}
              tone={(m.net_pnl as number) >= 0 ? "good" : "bad"}
            />
            <Stat
              label="Profit factor"
              value={num(m.profit_factor, 3)}
              tone={(m.profit_factor as number) >= 1.3 ? "good" : "bad"}
            />
            <Stat label="Return" value={`${num(m.return_pct, 2)}%`} />
            <Stat label="Max DD" value={`${num(m.max_drawdown_pct)}%`} />
            <Stat label="Costs paid" value={`₹${num(m.total_costs, 0)}`} />
            <Stat label="Expectancy" value={`₹${num(m.expectancy, 0)}`} />
          </div>

          {res.monte_carlo && (
            <section className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
              <div className="mb-1 text-sm font-medium text-slate-300">
                Monte-Carlo sequence risk ({res.monte_carlo.runs} reshuffles)
              </div>
              <p className="mb-2 text-[11px] text-slate-500">
                Same trades, different order. The drawdown you happened to get
                is one draw; this is the distribution.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Median max DD" value={`${num(res.monte_carlo.median_max_dd_pct)}%`} />
                <Stat label="95th-pct max DD" value={`${num(res.monte_carlo.p95_max_dd_pct)}%`} />
                <Stat label="Worst max DD" value={`${num(res.monte_carlo.worst_max_dd_pct)}%`} />
                <Stat label="P(profit)" value={`${num((res.monte_carlo.prob_profit ?? 0) * 100)}%`} />
              </div>
            </section>
          )}

          {res.folds.length > 0 && (
            <section className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
              <div className="mb-1 text-sm font-medium text-slate-300">
                Walk-forward windows
              </div>
              <p className="mb-2 text-[11px] text-slate-500">
                Stability matters as much as the average — a result carried by
                one lucky window is not a strategy.{" "}
                <span className={res.stable_across_folds ? "text-emerald-300" : "text-rose-300"}>
                  Stable across windows: {String(res.stable_across_folds)}
                </span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      <th className="px-2 py-1 text-left">Test window</th>
                      <th className="px-2 py-1 text-right">Trades</th>
                      <th className="px-2 py-1 text-right">Net P&L</th>
                      <th className="px-2 py-1 text-right">Win %</th>
                      <th className="px-2 py-1 text-right">PF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.folds.map((f) => (
                      <tr key={f.fold} className="border-t border-slate-800">
                        <td className="px-2 py-1 text-slate-400">{f.fold}</td>
                        <td className="px-2 py-1 text-slate-300">
                          {f.test_start} → {f.test_end}
                        </td>
                        <td className="px-2 py-1 text-right text-slate-300">{f.trades}</td>
                        <td className={`px-2 py-1 text-right ${(f.net_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          ₹{num(f.net_pnl, 0)}
                        </td>
                        <td className="px-2 py-1 text-right text-slate-300">{num(f.win_rate)}</td>
                        <td className="px-2 py-1 text-right text-slate-300">{num(f.pf, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="text-[11px] text-slate-600">{res.data_quality}</p>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      {children}
    </label>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const color =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : "text-slate-100"
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-base font-semibold ${color}`}>{value}</div>
    </div>
  )
}
