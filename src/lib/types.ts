export interface Instrument {
  symbol: string
  segment: "NSE_EQUITY" | "MCX_COMMODITY"
  lot_size: number
  tick_size: number
  reference_price: number
  contract_multiplier: number
}

export interface SegmentInfo {
  key: string
  label: string
}

export interface StrategyInfo {
  key: string
  name: string
  summary: string
  is_default: boolean
  /** Whether this strategy actually gates on the signal score. False means
   *  the score control is inert for it — the UI says so rather than letting
   *  a setting be silently ignored. */
  uses_min_score: boolean
  /** Segments this strategy can trade. [] = any. A non-empty list that does
   *  not include the selected ticker's segment means the run would return
   *  zero trades with no error, so the UI warns instead. */
  segments: string[]
  params: {
    timeframe: string
    risk_per_trade: number
    risk_reward: number
    atr_sl_mult: number
    atr_period: number
    allow_short: boolean
    max_hold_minutes: number
    /** The strategy's OWN threshold — what "inherit" resolves to. */
    cs_min_score: number
    /** Higher-timeframe bias filter, in minutes. 0 = single timeframe, which
     *  is every strategy except the session-anchored ones. */
    htf_minutes?: number
    /** Opening-range window in minutes. 0 = this strategy has no opening
     *  range; non-zero is what makes the UI show the session panel. */
    orb_minutes?: number
    /** IANA zone and wall-clock time the session is anchored to, e.g.
     *  "America/New_York" + "09:00". Empty = anchored to the local day. */
    orb_anchor_tz?: string
    orb_anchor_hhmm?: string
    /** Fraction booked at the first target on a MULTI-lot position. 0 = the
     *  whole position exits at the target. A 1-lot position never scales out
     *  whatever this says — it is indivisible. */
    partial_exit_fraction?: number
    /** Runner target as a multiple of the original risk, after the partial. */
    runner_rr_mult?: number
    /** Whether the remainder trails after the partial. */
    trail_remainder?: boolean
  }
}

export interface OpenPosition {
  entry_price: number
  stop_loss: number
  target: number
  quantity: number
  side: "BUY" | "SELL"
  contract_multiplier?: number
  _live_price?: number
  _broker_avg_price?: number | null
  _broker_pnl?: number | null
}

export interface LiveQuoteRow {
  Symbol: string
  Segment: string
  Market: string
  LTP: number | null
  Bid: number | null
  Ask: number | null
  Source: string
  "Tick age (s)": number | null
}

export interface SignalRow {
  time: string
  symbol: string
  segment: string
  side: string
  entry: number
  stop: number
  target: number
  rr: number
  qty: number
  deployed: number
  reason: string
  /** Whether the account actually acted on this signal. A qty=0 row is a
   *  signal that fired but could not be funded — without this it looks
   *  identical to a filled trade. Absent on rows recorded before this field
   *  existed, which are treated as taken. */
  status?: "TAKEN" | "SKIPPED"
  /** Why it was skipped, when it was. */
  skip_reason?: string
}

/** Shared shape of every P&L breakdown row (day, strategy, day×strategy).
 *  `Symbols` counts DISTINCT instruments, which is not the trade count. */
export interface PerfRow {
  Symbols: number
  Trades: number
  Closed: number
  Open: number
  Wins: number
  "Win Rate %": number
  "Realized PnL (₹)": number
}

export interface DailyPnlRow extends PerfRow {
  Date: string
  /** Every strategy that traded this day, comma-joined. When more than one
   *  did, DailyStrategyPnlRow splits the day's PnL between them. */
  Strategies: string
}

/** All-time P&L for one strategy (GET /trades/by-strategy). */
export interface StrategyPnlRow extends PerfRow {
  Strategy: string
}

/** One trading day × one strategy (GET /trades/daily-strategy-pnl). Each
 *  day's rows sum to that day's DailyPnlRow total. */
export interface DailyStrategyPnlRow extends PerfRow {
  Date: string
  Strategy: string
}

export interface RiskStatus {
  capital_allocated?: number
  trades_today?: number
  max_trades_per_day?: number
  max_qty_per_trade?: number
  intraday_leverage?: number
  daily_loss_limit?: number
  realized_pnl?: number
  halted?: boolean
  halt_reason?: string
}

/** The settings a running bot was STARTED with — frozen at start (see
 *  engine._snapshot_run_config), not a live read of saved config. Changing a
 *  preset or a per-stock setting never reaches a running engine, so this is
 *  the only honest answer to "what is actually running right now".
 *
 *  Fields that describe HOW the strategy decides (strategy, atr_*, min_score,
 *  entry_skip_minutes, use_limit_entry) are stripped for client accounts by
 *  the status route, so they are optional here. */
export interface RunConfig {
  started_at: string
  environment: string
  mode: string
  broker: string
  strategy?: { key: string; name: string }
  timeframe: string
  capital: number
  risk_per_trade_pct: number
  risk_reward: number
  atr_sl_mult?: number
  atr_period?: number
  min_score?: number
  max_hold_minutes: number
  entry_skip_minutes?: number
  allow_short: boolean
  use_limit_entry?: boolean
  square_off_enabled: boolean
  square_off_time: string
  instruments: string[]
  mcx_lots: Record<string, number>
  /** One line per symbol that deviates, in SymbolRules.describe()'s words. */
  symbol_overrides: string[]
  shared_with: number
}

/* -- Advanced backtest: symbol x pattern combination search ---------------- */

/** One (symbol, pattern) candidate. `screen_*` is the cheap attributed pass;
 *  `is_*` / `oos_*` come from real filtered runs on the two halves of the
 *  window, and are the numbers to judge on. */
export interface SearchCombo {
  symbol: string
  pattern: string
  /** "NSE_EQUITY" | "MCX_COMMODITY". Equity solves quantity from risk; MCX
   *  trades a fixed lot, so returns across the two are not comparable. */
  segment?: string
  screen_trades: number
  screen_pnl: number
  screen_win_rate: number
  verified: boolean
  is_return: number | null
  oos_return: number | null
  oos_trades: number
  oos_win_rate: number
  oos_profit_factor: number | null
  oos_max_dd: number | null
  /** The SAME symbol traded UNFILTERED over the SAME out-of-sample window. */
  baseline_oos_return: number | null
  /** oos_return − baseline_oos_return. Positive = the filter earned its place. */
  edge: number | null
  /** holds | promising | overfit | thin | fails | unverified */
  verdict: string
  note: string
  score: number
}

export interface SearchSymbolSummary {
  symbol: string
  trades: number
  segment?: string
  /** MCX only: margin one lot ties up. */
  margin_per_lot?: number | null
  /** MCX only: margin exceeded the run's capital, so it could never trade. */
  unaffordable?: boolean
  /** Unfiltered, over the WHOLE window (both halves). */
  return_pct: number
  win_rate: number
  source: string
  /** Unfiltered, over the OUT-OF-SAMPLE window only — the like-for-like
   *  comparison for a combination's OOS return. */
  baseline_oos_return: number | null
  error?: string
}

export interface SearchBucket {
  /** The validated PAIRINGS — the actual finding. */
  pairs: SearchCombo[]
  symbols: string[]
  patterns: string[]
  combinations: SearchCombo[]
  /** pattern -> symbols validated with it. A single pattern plus its symbols is
   *  the one shape today's settings express exactly, with no cross-product. */
  by_pattern: Record<string, string[]>
  /** Cells the flat symbol×pattern lists would enable that this search already
   *  marked `fails` or `overfit`. */
  conflicts: { symbol: string; pattern: string; verdict: string; oos_return: number | null }[]
  safe_plan: { pattern: string; symbols: string[] } | null
  /** Profitable out of sample, but beaten by trading the symbol unfiltered. */
  dropped_no_edge: { symbol: string; pattern: string; oos_return: number | null; edge: number | null }[]
  truncated: number
  why: string
}

export interface SearchResults {
  cancelled: boolean
  combos: SearchCombo[]
  symbols: SearchSymbolSummary[]
  split_date: string
  screened: number
  verified: number
  bucket?: SearchBucket
}

export interface SearchJob {
  id: string
  status: "running" | "done" | "cancelled" | "error"
  created_at: string
  done: number
  total: number
  label: string
  elapsed: number
  error: string
  spec?: Record<string, unknown>
  results?: SearchResults | null
}

/* -- Candlestick pattern allow-list --------------------------------------- */

/** One filterable strategy's vocabulary and semantics.
 *  kind "any-of"  — the signal names one thing; only listed names may fire.
 *  kind "require" — the signal is a confluence score; at least one listed
 *                   factor must be among its evidence. */
export interface FilterSpec {
  kind: "any-of" | "require"
  label: string
  help: string
  catalogue: string[]
}

/** Which patterns may open a trade, for one strategy + mode.
 *  `enabled=false` OR an empty `allowed` means no filtering at all. */
export interface PatternRules {
  enabled: boolean
  allowed: string[]
}

/** Realised PnL attributed to one pattern. `solo_*` counts only trades where
 *  this pattern fired ALONE — the clean read, since entry_reason usually holds
 *  a combination and every pattern in it gets credited. */
export interface PatternStat {
  pattern: string
  trades: number
  pnl: number
  win_rate: number
  avg_pnl: number
  solo_trades: number
  solo_pnl: number
  solo_win_rate: number
}

/* -- Trade charts (replay a trade on the candles it was taken on) ---------- */

/** One symbol the bot traded in the chosen window. */
export interface ChartSymbol {
  symbol: string
  trades: number
  pnl: number
  wins: number
  win_rate: number
  mode: string
  category: string
  first_trade: string
  last_trade: string
}

export interface ChartBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface ChartTrade {
  id: string
  side: string
  entry_time: number
  entry_price: number
  /** null while a position is still open at the right edge of the data. */
  exit_time: number | null
  exit_price: number | null
  stop_loss: number | null
  target: number | null
  quantity: number
  pnl: number
  win: boolean
  strategy: string
  mode: string
  entry_reason: string
  exit_reason: string
}

export interface ChartCandles {
  symbol: string
  interval: string
  mode: string
  source: string
  candles: ChartBar[]
  trades: ChartTrade[]
  /** false when history fell back to a synthetic random walk. */
  is_real_data: boolean
}

/* -- AI Auditor (read-only LLM review of past trades) ---------------------- */

export interface AuditProviderInfo {
  name: string
  available: boolean
  model: string
}

export interface AuditRecommendation {
  priority: number
  lever: string
  scope: string
  current: string
  proposed: string
  rationale: string
  evidence: string
  expected_effect: string
  risk_of_change: string
  how_to_verify: string
}

export interface AuditFinding {
  claim: string
  evidence: string
  sample: number
}

export interface AuditReportBody {
  verdict: "LOSING" | "MARGINAL" | "PROFITABLE" | "INSUFFICIENT_DATA"
  headline: string
  confidence: "low" | "medium" | "high"
  confidence_reason: string
  what_is_working: AuditFinding[]
  what_is_broken: AuditFinding[]
  recommendations: AuditRecommendation[]
  do_not_change: { item: string; why: string }[]
  data_gaps: string[]
}

/** A saved audit. `unverified_numbers` lists figures in the report that do NOT
 *  appear in the pack — i.e. the model computed something it was told not to. */
export interface AuditReport {
  id: string
  created_at: string
  environment: string
  window: { from: string; to: string }
  provider: string
  model: string
  closed_trades: number
  pack_bytes: number
  pack_hash?: string
  verdict: string
  headline: string
  report?: AuditReportBody
  unverified_numbers?: string[]
  error?: string
  /** Every provider tried, in order, with the reason each failed. */
  attempts?: { provider: string; model: string; ok: boolean; error: string }[]
  /** True when the preferred provider failed and another answered instead. */
  fell_back?: boolean
}

export interface AuditPreview {
  pack: Record<string, unknown>
  bytes: number
  closed_trades: number
}

/** One bucket of a trade-log cut (weekday, hour, setup or side). */
export interface AnalyticsBucket {
  key: string | number
  label: string
  pnl: number
  trades: number
  wins: number
  win_rate: number
}

/** Cuts of the trade log for the analytics charts, computed server-side from
 *  the same trade rows the run returns — so charts and tables cannot disagree. */
export interface TradeAnalytics {
  by_weekday: AnalyticsBucket[]
  by_hour: AnalyticsBucket[]
  by_setup: AnalyticsBucket[]
  by_side: AnalyticsBucket[]
  insights: string[]
  total_trades: number
}

/** One symbol's row in a bulk run, ranked by return. */
export interface BulkRankRow {
  Ticker: string
  "Total Return %": number
  "Max Drawdown %": number
  Sharpe: number
  Calmar: number
  "Win Rate %": number
  Trades: number
  "Final Equity": number
  "Data Source": string
}

export interface BulkBacktestResult {
  ranking: BulkRankRow[]
  analytics: TradeAnalytics
  filters: string
  tickers: number
}

/** One RR rung of a sweep (POST /backtest/rr-sweep). `error` is non-empty when
 *  that single RR failed — the sweep keeps the rows it did compute. */
export interface RRSweepRow {
  risk_reward: number
  trades: number
  return_pct: number
  win_rate: number
  max_drawdown: number
  sharpe: number
  calmar: number
  final_equity: number
  data_source: string
  error: string
}

export interface RRSweepResult {
  rows: RRSweepRow[]
  /** RR with the highest return, or null if every rung failed. */
  best_by_return: number | null
}

/** One strategy and the stocks assigned to it (GET/PUT /admin/strategy-groups).
 *  A symbol may appear in several groups; only one trade in it opens at a
 *  time, enforced at execution by capital_ledger. */
export interface StrategyGroup {
  strategy_key: string
  symbols: string[]
  mcx_lots: Record<string, number>
  /** 0 = use the strategy's own. */
  risk_reward: number
  /** 0 = use the strategy's own. */
  min_score: number
  enabled: boolean
}

/** Per-strategy breakdown in /bot/status when a board is running. Absent for
 *  a single-strategy run. */
export interface GroupStatus {
  strategy_key: string
  strategy_name: string
  running: boolean
  symbols: string[]
  open: string[]
  day_pnl: number
  risk_reward: number
}

export interface BotStatus {
  started: boolean
  run_config?: RunConfig
  groups?: GroupStatus[]
  environment?: string
  mode?: string
  strategy?: { key: string; name: string }
  total_capital?: number
  running?: boolean
  feed_status?: string
  broker_name?: string
  db_backend?: string
  last_signals?: SignalRow[]
  open_positions?: Record<string, OpenPosition>
  live_quotes?: Record<string, LiveQuoteRow>
  day_pnl?: number
  realized_pnl?: number
  unrealized_pnl?: number
  trading_day?: string
  daily_pnl?: DailyPnlRow[]
  strategy_pnl?: StrategyPnlRow[]
  daily_strategy_pnl?: DailyStrategyPnlRow[]
  log?: string[]
  risk_status?: RiskStatus
}

/** One decision the platform's shared strategy made (GET /bot/platform-signals).
 *  Carries NO quantity: size is per-account and only exists once an account
 *  actually takes the trade. */
export interface PlatformSignal {
  time: string
  symbol: string
  segment: string
  side: string
  entry: number
  stop: number
  target: number
  rr: number
  reason: string
}

export interface PlatformSignalsResponse {
  /** Whether YOUR OWN bot is running — watching is not trading. */
  running: boolean
  /** Whether the shared strategy is live right now. */
  live: boolean
  mode: string
  signals: PlatformSignal[]
}

/** Asset classes trades are bucketed into. Crypto exists before any crypto
 *  instrument does, so the reporting split is stable when it arrives. */
export type Category = "Equity" | "Commodity" | "Crypto"

export interface CategorySummary extends AnalyticsSummary {
  category: Category
}

/** Result of POST /admin/trades/reset-range. With confirm=false this is a
 *  PREVIEW: `matched` is what WOULD go and `removed` is 0. */
export interface RangeResetResult {
  matched: number
  removed: number
  dry_run: boolean
  start: string
  end: string
  by_day: Record<string, number>
  /** Trades in range the bot still holds OPEN — deleting these leaves a real
   *  position with nothing tracking it. */
  open_matched: number
  environment: string
  category: string
  username: string
}

export interface BrokerPosition {
  symbol: string
  side: string
  quantity: number
  average_price: number
  last_price: number
  pnl: number
}

/** An SL/TP the BROKER is holding — read back from the broker, not from what
 *  the bot believes it armed, so the two can be compared. `symbol` is the
 *  broker's own tradingsymbol and joins to BrokerPosition.symbol. `side` is
 *  the protective order's own (exit) side. `target` is 0 for kind "SLM",
 *  which carries no take-profit leg. */
export interface BrokerProtection {
  symbol: string
  side: string
  quantity: number
  kind: "GTT" | "SLM"
  stop: number
  target: number
  status: string
  id: string
}

export interface RiskLimits {
  capital_allocated: number
  max_daily_loss_cash: number
  max_daily_loss_pct: number
  max_trades_per_day: number
  max_qty_per_trade: number
  intraday_leverage: number
}

export interface TradeRow {
  trade_id: string
  timestamp: string
  mode: string
  strategy: string
  entry_reason: string
  environment: string
  broker: string
  segment: string
  ticker: string
  side: string
  entry_price: number
  stop_loss: number
  target: number
  quantity: number
  status: string
  exit_price?: number
  realized_pnl?: number
  [key: string]: unknown
}

export interface AnalyticsSummary {
  total_trades: number
  win_rate: number
  total_pnl: number
  avg_pnl: number
  [key: string]: unknown
}

export interface BrokerStatusEntry {
  ok: boolean | null
  detail: string
}

/** Everything the server will say about a client's stored broker credentials.
 *  There is deliberately no field for the API secret — no endpoint returns it. */
export interface BrokerCredentialSummary {
  configured: boolean
  api_key_masked: string
  updated_at: string
  has_token: boolean
  token_issued_at?: string
}

export interface BrokerOnboardingInfo {
  redirect_uri: string
  vault_ready: boolean
  brokers: { key: string; console_url: string; note: string }[]
}

export interface BacktestResult {
  metrics: Record<string, number | string>
  equity_curve: { t: string; equity: number }[]
  trades: Record<string, unknown>[]
  analytics?: TradeAnalytics
  /** Human summary of the entry filters applied, "" when unrestricted. */
  filters?: string
}

export interface ClientUser {
  user_id: string
  username: string
  role: string
  status: "active" | "disabled"
  display_name: string
  created_at: string
  broker_tokens?: Record<string, string>
}

export interface ClientOverviewRow {
  user_id: string
  username: string
  display_name: string
  status: "active" | "disabled"
  created_at: string
  /** Where this client's forgot-password code is sent. Empty = they cannot
   *  self-serve a reset; only admin can change their password. */
  email?: string
  running: boolean
  environment: string | null
  broker: string | null
  paper_total_pnl: number
  live_total_pnl: number
  broker_connected: string[]
  credentials_configured?: string[]
}

/** One client's bot statistics, admin-only (GET /admin/clients/{username}/stats). */
export interface ClientStats {
  username: string
  environment: string
  running: boolean
  summary: AnalyticsSummary
  daily_pnl: DailyPnlRow[]
  strategy_pnl: StrategyPnlRow[]
  daily_strategy_pnl: DailyStrategyPnlRow[]
  trades: TradeRow[]
}

export interface AdminModeConfig {
  strategy_key: string
  segments: string[]
  symbols: string[]
  mcx_lots: Record<string, number>
  /**
   * Risk:reward for this mode, as reward per 1 unit of risk.
   * 0 = inherit the chosen strategy's own value. Valid values come from
   * GET /config/rr-choices; the backend rejects anything else.
   */
  risk_reward: number
  /** Signal-score threshold for this mode. 0 = inherit the strategy's own. */
  min_score: number
  /** End-of-session flat-out, "HH:MM" IST. "" = the segment default
   *  (15:09 equity, 23:15 MCX). Ignored for Swing. */
  square_off_time: string
  square_off_enabled: boolean
}

export interface AdminBotConfig {
  /** mode name -> what a client trades when they pick that mode */
  by_mode: Record<string, AdminModeConfig>
  /** modes admin offers in the client's Start Bot picker */
  client_modes: string[]
  /** Start every eligible client when admin starts, publishing that run as
   *  the config clients follow. Absent on servers predating the field, which
   *  reads as off. */
  auto_start_clients?: boolean
}

/** Fan-out summary returned by POST /bot/start when admin auto-starts
 *  clients. `skipped` names each account that did NOT start and why. */
export interface ClientStartSummary {
  total: number
  started: string[]
  skipped: { username: string; reason: string }[]
}

/**
 * One instrument's own settings within one mode (GET/PUT /admin/symbol-config).
 * Every field's default is the "not configured" value, and a symbol that is
 * all-defaults is not stored at all — it simply trades the way the strategy
 * alone dictates. These gate NEW ENTRIES and move the target; they never
 * change signal logic or position sizing.
 */
export interface SymbolConfig {
  /** Weekdays new entries may open on, 0=Mon … 6=Sun. [] = every day. */
  trade_days: number[]
  /** HOURS (0-23 IST) new entries may open in. Hour H covers H:00–H:59, so
   *  gaps are expressible: [9,10,11,15] skips 12:00–14:59. [] = no filter. */
  trade_hours: number[]
  /** "HH:MM" IST. "" = the segment's own session open/close. */
  start_time: string
  end_time: string
  /** 0 = inherit the mode/strategy RR. Other values must be in RR_CHOICES. */
  risk_reward: number
  /** Close an open position when the window ends. Default false. */
  square_off_at_end: boolean
  /** Trail this stock's stop behind the best price reached. Default false. */
  trail_enabled: boolean
  /** ATR multiple the trail sits behind the peak. 0 = inherit the strategy's
   *  own atr_sl_mult. Inert unless trail_enabled. */
  trail_atr_mult: number
}

export const EMPTY_SYMBOL_CONFIG: SymbolConfig = {
  trade_days: [],
  trade_hours: [],
  start_time: "",
  end_time: "",
  risk_reward: 0,
  square_off_at_end: false,
  trail_enabled: false,
  trail_atr_mult: 0,
}

/** True when this config would change nothing — mirrors
 *  symbol_config.SymbolConfig.is_noop() on the server, which deletes rather
 *  than stores such an entry. */
export function isDefaultSymbolConfig(c: SymbolConfig): boolean {
  return (
    c.trade_days.length === 0 &&
    c.trade_hours.length === 0 &&
    !c.start_time &&
    !c.end_time &&
    !c.risk_reward &&
    !c.square_off_at_end &&
    // trail_atr_mult is deliberately NOT tested: it is inert without
    // trail_enabled, so a multiple left behind by a toggled-off trail must
    // still count as "no settings" and delete the entry. Mirrors is_noop().
    !c.trail_enabled
  )
}

/**
 * A named snapshot of the whole Controls sidebar (GET/PUT /admin/presets).
 * Inert until loaded: saving never touches a running bot, and loading only
 * repopulates the controls and restores that mode's per-symbol settings —
 * it never starts or stops anything.
 */
export interface ControlPreset {
  environment: "Paper" | "Live"
  mode: string
  broker: string
  strategy_key: string
  segments: string[]
  symbols: string[]
  capital: number
  min_score: number
  mcx_lots: Record<string, number>
  /** symbol -> its settings for `mode`, as they were when saved. */
  symbol_configs: Record<string, SymbolConfig>
  /** UTC ISO timestamp of the last save. */
  saved_at: string
}

/** One entry of the client's own phase picker (GET /config/client-modes) —
 *  only modes admin enabled AND configured with instruments appear.
 *  No strategy identity is carried here: the server does not send it to
 *  client accounts. */
export interface ClientModeInfo {
  key: string
  label: string
  risk_reward: number
  instrument_count: number
}

/* -- Bulk Backtest: multi-axis optimizer funnel ----------------------------- */

/** One row in the funnel's final result table. */
/** One rung of a symbol's own hit-rate curve — see FunnelRow.rr_curve. */
export interface RrHitPoint {
  rr: number
  trades: number
  /** % of this pair's trades that reached this RR before exit. */
  hit_rate: number
  /** False when `trades` is below the funnel's reliability floor — the UI
   *  should grey the point out rather than drop it. */
  reliable: boolean
}

export interface FunnelRow {
  symbol: string
  strategy_key: string
  segment: string
  rr: number
  /** Per-rung "how far does it actually get" — see RrHitPoint. Two symbols
   *  can share the same `rr` (picked by net PnL) and still move completely
   *  differently; this curve is what tells them apart. */
  rr_curve: RrHitPoint[]
  /** Median bars from entry to first reaching 1R, among trades that got
   *  there at all. null if none did. Bar unit follows the run's mode (15m
   *  Intraday, 1m Scalper, 1d Swing). */
  median_bars_to_1r: number | null
  /** This pair's best RR with NOTHING filtered (Round 0b). 0 = sweep not run. */
  baseline_rr: number
  baseline_trades: number
  baseline_net_pnl: number
  patterns: string[]
  hours: number[]
  days: number[]
  screen_trades: number
  screen_net_pnl: number
  screen_gross_pnl: number
  screen_costs: number
  is_return: number | null
  oos_return: number | null
  folds_positive: number
  folds_total: number
  /** holds | promising | marginal | overfit | fails | unverified */
  verdict: string
  note: string
  score: number
}

/** Progress of one round in the funnel. */
export interface FunnelRound {
  round: number
  name: string
  done: number
  total: number
  survivors: number
  /** What `survivors` counts, when it isn't surviving pairs. */
  survivors_label?: string
}

/** One rung of the unfiltered RR sweep, aggregated over the whole selection. */
export interface FunnelBaselineRow {
  rr: number
  trades: number
  gross_pnl: number
  net_pnl: number
  costs: number
  win_rate: number
  net_return_pct: number
  pairs: number
  pairs_positive: number
}

/** Round 0b — the unfiltered control: no patterns, no hours, no weekdays,
 *  no score floor. Only RR varies. */
export interface FunnelBaseline {
  enabled: boolean
  note: string
  rr_ladder: number[]
  by_rr: FunnelBaselineRow[]
  best_rr: number
  best_net_pnl: number
  best_net_return_pct: number
  best_trades: number
  verdict: string
  per_pair: {
    symbol: string
    strategy_key: string
    segment: string
    best_rr: number
    trades: number
    net_pnl: number
    by_rr: Record<string, number>
  }[]
}

/** The complete output of a funnel run. */
export interface FunnelResults {
  cancelled: boolean
  table: FunnelRow[]
  rounds: FunnelRound[]
  /** null when the baseline sweep was switched off for this run. */
  baseline: FunnelBaseline | null
  holds: number
  tested: number
  elapsed: number
  spec: Record<string, unknown>
}

/** A funnel job (running or finished). */
export interface FunnelJob {
  id: string
  status: "running" | "done" | "cancelled" | "error"
  created_at: string
  done: number
  total: number
  round: number
  round_name: string
  label: string
  elapsed: number
  error: string
  spec?: Record<string, unknown>
  results?: FunnelResults | null
}
