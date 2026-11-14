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
  /** When the admin last emailed the client this week's report ("" / absent = never). */
  report_emailed_at?: string
  /** `upi://pay?...` for a due invoice, "" otherwise. */
  upi_uri: string
}

/** One monthly server + maintenance invoice (billed in advance). */
export interface ServiceInvoice {
  invoice_id: string
  kind: "service"
  username: string
  period_start: string
  period_end: string
  server_fee: number
  maintenance_fee: number
  amount: number
  status: "due" | "paid" | "verified"
  paid_at: string
  paid_ref: string
  verified_at: string
  upi_uri: string
}

export interface ServiceStatement {
  server_fee: number
  maintenance_fee: number
  monthly_total: number
  /** Billing anchor — every month is billed on this day. "" = no plan. */
  start_date: string
  next_bill_date: string
  total_due: number
  total_paid: number
  total_unverified: number
  invoices: ServiceInvoice[]
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
  /** Monthly server + maintenance charges. */
  service: ServiceStatement
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
  /** Every paid / verified invoice across clients, newest first. */
  payments: (CommissionInvoice & { display_name: string })[]
  service_totals: { total_due: number; total_paid: number; total_unverified: number }
  service_payments: (ServiceInvoice & { display_name: string })[]
}

/** "19 Oct 2026, 3:42 pm" in the viewer's local time, or "—". */
export const paidOn = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—"

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

const longDay = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" })

/** "15 Nov 2026 – 14 Dec 2026" for a monthly period. */
export const periodLabel = (start: string, end: string) =>
  `${longDay.format(new Date(`${start}T00:00:00`))} – ${longDay.format(new Date(`${end}T00:00:00`))}`

export const dayLabel = (d: string) => (d ? longDay.format(new Date(`${d}T00:00:00`)) : "—")
