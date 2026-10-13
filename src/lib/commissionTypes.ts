export type InvoiceStatus = "due" | "nil" | "paid" | "verified"

export interface CommissionInvoice {
  invoice_id: string
  username: string
  week_start: string
  week_end: string
  environment: string
  profit: number
  trades: number
  pct: number
  amount: number
  status: InvoiceStatus
  paid_at: string
  paid_ref: string
  verified_at: string
  /** `upi://pay?...` for a due invoice, "" otherwise. */
  upi_uri: string
}

export interface CommissionStatement {
  username: string
  commission_pct: number
  commission_from: string
  current_week: {
    week_start: string
    week_end: string
    payable_on: string
    profit: number
    trades: number
    accrued: number
  }
  total_due: number
  total_paid: number
  total_unverified: number
  invoices: CommissionInvoice[]
}

export interface ClientCommission extends CommissionStatement {
  upi_id: string
  payee_name: string
  environment: string
}

export interface CommissionSettings {
  upi_id: string
  payee_name: string
  environment: "Live" | "Paper"
}

export interface CommissionOverview {
  settings: CommissionSettings
  backend: string
  ledger_shared: boolean
  totals: { total_due: number; total_paid: number; total_unverified: number }
  clients: (CommissionStatement & { display_name: string; account_status: string })[]
}

export const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" })

/** "5 Oct – 11 Oct" for a Monday–Sunday week. */
export const weekLabel = (start: string, end: string) =>
  `${dayFmt.format(new Date(`${start}T00:00:00`))} – ${dayFmt.format(new Date(`${end}T00:00:00`))}`

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  due: "🟡 Due",
  nil: "⚪ Nothing due",
  paid: "🟢 Marked paid",
  verified: "✅ Verified",
}
