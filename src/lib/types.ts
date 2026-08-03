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
  params: {
    timeframe: string
    risk_per_trade: number
    risk_reward: number
    atr_sl_mult: number
    atr_period: number
    allow_short: boolean
    max_hold_minutes: number
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
}

export interface DailyPnlRow {
  Date: string
  Trades: number
  Closed: number
  Open: number
  Wins: number
  "Win Rate %": number
  "Realized PnL (₹)": number
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

export interface BotStatus {
  started: boolean
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
  log?: string[]
  risk_status?: RiskStatus
}

export interface BrokerPosition {
  symbol: string
  side: string
  quantity: number
  average_price: number
  last_price: number
  pnl: number
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
  trades: TradeRow[]
}

export interface AdminModeConfig {
  strategy_key: string
  segments: string[]
  symbols: string[]
  mcx_lots: Record<string, number>
}

export interface AdminBotConfig {
  /** mode name -> what a client trades when they pick that mode */
  by_mode: Record<string, AdminModeConfig>
  /** modes admin offers in the client's Start Bot picker */
  client_modes: string[]
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
