/** Mirrors backend/fleet_broadcast.FleetHub.status() and api/routers/fleet.py. */

export interface FleetClientRow {
  username: string
  running: boolean
  day_pnl: number
  open: string[]
}

export interface FleetNode {
  node_id: string
  name: string
  /** The ONE client this server trades for ("" = none — trades nobody). */
  username: string
  enabled: boolean
  connected: boolean
  seconds_since_seen: number | null
  version: string
  last_connected_at: string
  created_at: string
  running: boolean
  environment: string
  broker: string
  clients: FleetClientRow[]
  /** symbol -> the positions the node's clients hold in it. */
  positions: Record<string, unknown[]>
  day_pnl: number
  realized_pnl: number
  unrealized_pnl: number
  hub_link: string
  last_error: string
  /** Why a client on this node is NOT trading, in words. */
  last_start: {
    total?: number
    started?: string[]
    skipped?: { username: string; reason: string }[]
  }
  /** Where this server's trades are really going: "MongoDB" or "Local JSON". */
  db_backend: string
  /** Non-empty when this server's trades will NOT reach the hub's database —
   *  it fell back to a local file, or points at a different database. */
  db_problem: string
}

export interface BroadcastConfigInfo {
  environment: "Paper" | "Live"
  mode: string
  strategy_key: string
  symbols: string[]
  mcx_lots: Record<string, number>
  risk_reward: number
  min_score: number
  square_off_time: string
  square_off_enabled: boolean
  exit_style: string
  trail_atr_mult: number
  max_stop_pct: number
  min_stop_pct: number
}

export interface FleetSignal {
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

/** GET /fleet/pnl — every client's results, from the shared trade database. */
export interface FleetPnlClient {
  username: string
  display_name: string
  status: string
  /** The fleet server this client trades on; null if not on one right now. */
  node: string | null
  running: boolean
  environment: string | null
  total_pnl: number
  today_pnl: number
  trades: number
  closed: number
  open: number
  wins: number
  win_rate: number
}

export interface FleetPnl {
  environment: "Paper" | "Live"
  totals: {
    clients: number
    running: number
    total_pnl: number
    today_pnl: number
    trades: number
    closed: number
    open: number
    win_rate: number
  }
  clients: FleetPnlClient[]
  daily: { date: string; pnl: number; trades: number; closed: number; wins: number; clients: number }[]
}

export interface FleetStatus {
  /** Whether the hub itself is on MongoDB — the database every node must share. */
  hub_db_backend: string
  active: boolean
  config: BroadcastConfigInfo | null
  started_at: string
  feed: string
  feed_simulated: boolean
  signals: FleetSignal[]
  nodes: FleetNode[]
  connected: number
  log: string[]
}

/** Returned ONCE when a node is created — the secret cannot be fetched again. */
export interface NewFleetNode {
  node_id: string
  name: string
  secret: string
}
