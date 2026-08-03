/** Trading phases, mirroring backend/admin_config.py.
 *
 *  "Phase" is what a client sees — which style of trading is running. The
 *  strategy behind a phase is admin-only and is not sent to client accounts
 *  at all (see /config/client-modes and /bot/status). */

/** Mirrors admin_config.CLIENT_SELECTABLE_MODES — Swing is admin-only. */
export const CLIENT_SELECTABLE_MODES = ["Intraday", "Scalper"] as const

/** Long form, for pickers where there's room for the timeframe. */
export const MODE_LABELS: Record<string, string> = {
  Intraday: "Intraday (15-minute)",
  Scalper: "Scalping (1-minute)",
  Swing: "Swing (daily)",
}

/** Short form, for chips and headers. */
export const PHASE_LABELS: Record<string, string> = {
  Intraday: "Intraday",
  Scalper: "Scalping",
  Swing: "Swing",
}

export function phaseLabel(mode: string | undefined): string {
  if (!mode) return "-"
  return PHASE_LABELS[mode] ?? mode
}
