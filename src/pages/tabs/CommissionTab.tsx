import { useEffect, useState, type FormEvent } from "react"
import DataTable from "../../components/DataTable"
import UpiQr from "../../components/UpiQr"
import { api, ApiError } from "../../lib/api"
import {
  dayLabel,
  paidOn,
  periodLabel,
  rupees,
  STATUS_LABEL,
  weekLabel,
  type CommissionInvoice,
  type CommissionOverview,
  type CommissionSettings,
  type ServiceInvoice,
} from "../../lib/commissionTypes"
import { usePolling } from "../../lib/usePolling"

type Client = CommissionOverview["clients"][number]
type Msg = { kind: "ok" | "err"; text: string } | null

const input = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
const btn = "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
const small = "rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"

const errText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback

export default function CommissionTab() {
  const { data, error, refresh } = usePolling<CommissionOverview>(
    () => api.get<CommissionOverview>("/commission/admin/overview"),
    60000,
  )
  const [form, setForm] = useState<CommissionSettings>({ upi_id: "", payee_name: "", environment: "Live" })
  const [msg, setMsg] = useState<Msg>(null)
  const [rateFor, setRateFor] = useState<Client | null>(null)
  const [rate, setRate] = useState({ pct: "", from: "" })
  const [openFor, setOpenFor] = useState("")
  const [qrFor, setQrFor] = useState<CommissionInvoice | null>(null)
  const [planFor, setPlanFor] = useState<Client | null>(null)
  const [plan, setPlan] = useState({ server: "", maint: "", start: "" })
  const [svcQrFor, setSvcQrFor] = useState<ServiceInvoice | null>(null)

  useEffect(() => {
    if (data) setForm(data.settings)
    // Only when the saved settings change — not on every poll, or typing is overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.settings.upi_id, data?.settings.payee_name, data?.settings.environment])

  const act = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    setMsg(null)
    try {
      await fn()
      setMsg({ kind: "ok", text: ok })
      refresh()
      return true
    } catch (err) {
      setMsg({ kind: "err", text: errText(err, fail) })
      return false
    }
  }

  const saveSettings = (e: FormEvent) => {
    e.preventDefault()
    act(() => api.put("/commission/admin/settings", form), "Payment settings saved.", "Failed to save.")
  }

  const saveRate = async () => {
    if (!rateFor) return
    const done = await act(
      () =>
        api.put(`/commission/admin/clients/${encodeURIComponent(rateFor.username)}/rate`, {
          pct: Number(rate.pct),
          effective_from: rate.from,
        }),
      `${rateFor.display_name}: commission set to ${Number(rate.pct)}%.`,
      "Failed to set the rate.",
    )
    if (done) setRateFor(null)
  }

  const setStatus = (inv: CommissionInvoice, status: "verified" | "due") =>
    act(
      () =>
        api.put(
          `/commission/admin/clients/${encodeURIComponent(inv.username)}/invoices/${inv.week_start}`,
          { status },
        ),
      status === "verified" ? "Marked as received." : "Reopened — it is due again.",
      "Failed to update.",
    )

  const savePlan = async () => {
    if (!planFor) return
    const server = Number(plan.server || 0)
    const maint = Number(plan.maint || 0)
    const done = await act(
      () =>
        api.put(`/commission/admin/clients/${encodeURIComponent(planFor.username)}/service-plan`, {
          server_fee: server,
          maintenance_fee: maint,
          start_date: plan.start,
        }),
      server + maint > 0
        ? `${planFor.display_name}: monthly charges set to ${rupees(server + maint)}.`
        : `${planFor.display_name}: monthly charges switched off.`,
      "Failed to save the monthly plan.",
    )
    if (done) setPlanFor(null)
  }

  const emailReport = (inv: CommissionInvoice) =>
    act(
      () =>
        api.post(
          `/commission/admin/clients/${encodeURIComponent(inv.username)}/invoices/${inv.week_start}/email`,
        ),
      `Weekly report emailed to ${inv.username}.`,
      "Failed to send the report.",
    )

  const sendWeeklySummary = async () => {
    setMsg(null)
    try {
      const res = await api.post<{ ok?: boolean; week: string; clients?: number; error?: string }>(
        "/commission/admin/weekly-report",
      )
      setMsg(
        res.ok
          ? { kind: "ok", text: `Summary for the week of ${res.week} emailed to you (${res.clients ?? 0} clients).` }
          : { kind: "err", text: res.error || "The summary email was not sent." },
      )
      refresh()
    } catch (err) {
      setMsg({ kind: "err", text: errText(err, "Failed to send the weekly summary.") })
    }
  }

  const setServiceStatus = (inv: ServiceInvoice, status: "verified" | "due") =>
    act(
      () =>
        api.put(
          `/commission/admin/clients/${encodeURIComponent(inv.username)}/service/${inv.period_start}`,
          { status },
        ),
      status === "verified" ? "Marked as received." : "Reopened — it is due again.",
      "Failed to update.",
    )

  if (!data) {
    return <p className="text-sm text-slate-500">{error ?? "Loading…"}</p>
  }

  const open = data.clients.find((c) => c.username === openFor)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Outstanding (due from clients)", rupees(data.totals.total_due)],
          ["Marked paid, not yet verified", rupees(data.totals.total_unverified)],
          ["Total paid to WelthWest", rupees(data.totals.total_paid)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-800 p-3">
            <div className="text-[11px] text-slate-500">{label}</div>
            <div className="text-lg font-semibold text-slate-100">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Monthly charges outstanding", rupees(data.service_totals.total_due)],
          ["Monthly charges marked paid, not verified", rupees(data.service_totals.total_unverified)],
          ["Monthly charges paid", rupees(data.service_totals.total_paid)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-800 p-3">
            <div className="text-[11px] text-slate-500">🖥️ {label}</div>
            <div className="text-lg font-semibold text-slate-100">{value}</div>
          </div>
        ))}
      </div>

      {!data.ledger_shared && (
        <p className="text-xs text-amber-400">
          ⚠️ This server's trade store and commission store are on different backends (one fell
          back to a local file), so invoices are shown as last saved and are not being recalculated.
        </p>
      )}

      <form onSubmit={saveSettings} className="rounded-lg border border-slate-800 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">💳 Where clients pay</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-400">
            UPI ID
            <input
              required
              className={`${input} mt-1 w-full`}
              value={form.upi_id}
              onChange={(e) => setForm({ ...form, upi_id: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-400">
            Payee name shown in the UPI app
            <input
              className={`${input} mt-1 w-full`}
              value={form.payee_name}
              onChange={(e) => setForm({ ...form, payee_name: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-400">
            Charge commission on
            <select
              className={`${input} mt-1 w-full`}
              value={form.environment}
              onChange={(e) => setForm({ ...form, environment: e.target.value as "Live" | "Paper" })}
            >
              <option value="Live">Live trades (real money)</option>
              <option value="Paper">Paper trades (testing only)</option>
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Every invoice QR pays this UPI ID with the amount pre-filled. Profit is the bot's own
          trade log for the week (gross of brokerage and taxes); a losing week owes nothing and is
          not carried forward. Invoices are stored on: {data.backend}.
        </p>
        <button type="submit" className={`${btn} mt-3 bg-indigo-600 text-white hover:bg-indigo-500`}>
          Save
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 p-4">
        <div className="flex-1 text-xs text-slate-400">
          <div className="text-sm font-semibold text-slate-200">📬 Weekly summary</div>
          Every Monday from 6:00 AM IST last week's invoices are created and a summary of every
          client's profit and commission is emailed to you. Clients are emailed only when you press
          📧 Email report on their invoice.
        </div>
        <button
          type="button"
          onClick={sendWeeklySummary}
          className={`${btn} bg-slate-700 text-slate-100 hover:bg-slate-600`}
        >
          Send last week's summary now
        </button>
      </div>

      {msg && (
        <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Clients</h3>
        <DataTable
          rows={data.clients}
          rowKey={(r) => r.username}
          empty="No clients yet — create one on the Clients tab."
          columns={[
            { key: "name", header: "Client", render: (r) => `${r.display_name} (${r.username})` },
            {
              key: "pct",
              header: "Commission",
              render: (r) =>
                r.commission_pct > 0 ? (
                  `${r.commission_pct}% · from ${r.commission_from}`
                ) : (
                  <span className="text-amber-400">not set</span>
                ),
            },
            { key: "profit", header: "This week's profit", render: (r) => rupees(r.current_week.profit) },
            { key: "accrued", header: "Accruing", render: (r) => rupees(r.current_week.accrued) },
            {
              key: "due",
              header: "Due",
              render: (r) => (
                <span className={r.total_due > 0 ? "text-amber-400" : ""}>{rupees(r.total_due)}</span>
              ),
            },
            { key: "paid", header: "Paid", render: (r) => rupees(r.total_paid) },
            {
              key: "svc",
              header: "Monthly (server + maint.)",
              render: (r) =>
                r.service.monthly_total > 0 ? (
                  <span>
                    {rupees(r.service.monthly_total)} · next {dayLabel(r.service.next_bill_date)}
                    {r.service.total_due > 0 && (
                      <span className="text-amber-400"> · due {rupees(r.service.total_due)}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-500">not set</span>
                ),
            },
            {
              key: "actions",
              header: "Actions",
              render: (r) => (
                <div className="flex gap-1">
                  <button
                    className={small}
                    onClick={() => {
                      setRateFor(r)
                      setRate({ pct: String(r.commission_pct || ""), from: "" })
                    }}
                  >
                    ％ Set rate
                  </button>
                  <button
                    className={small}
                    onClick={() => {
                      setPlanFor(r)
                      setPlan({
                        server: String(r.service.server_fee || ""),
                        maint: String(r.service.maintenance_fee || ""),
                        start: r.service.start_date,
                      })
                    }}
                  >
                    🖥️ Monthly plan
                  </button>
                  <button
                    className={small}
                    onClick={() => setOpenFor(openFor === r.username ? "" : r.username)}
                  >
                    🧾 Invoices ({r.invoices.length + r.service.invoices.length})
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          Payment history ({data.payments.length})
        </h3>
        <DataTable
          rows={data.payments}
          rowKey={(r) => r.invoice_id}
          empty="No payments yet."
          columns={[
            { key: "paid", header: "Paid on", render: (r) => paidOn(r.paid_at || r.verified_at) },
            { key: "name", header: "Client", render: (r) => `${r.display_name} (${r.username})` },
            { key: "week", header: "Week", render: (r) => weekLabel(r.week_start, r.week_end) },
            { key: "profit", header: "Profit", render: (r) => rupees(r.profit) },
            { key: "pct", header: "Rate", render: (r) => `${r.pct}%` },
            { key: "amount", header: "Amount", render: (r) => rupees(r.amount) },
            { key: "ref", header: "UPI reference", render: (r) => r.paid_ref || "—" },
            { key: "status", header: "Status", render: (r) => STATUS_LABEL[r.status] },
            {
              key: "actions",
              header: "Actions",
              render: (r) =>
                r.status === "paid" ? (
                  <button className={small} onClick={() => setStatus(r, "verified")}>
                    ✅ Received
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">verified {paidOn(r.verified_at)}</span>
                ),
            },
          ]}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          🖥️ Monthly charges payment history ({data.service_payments.length})
        </h3>
        <DataTable
          rows={data.service_payments}
          rowKey={(r) => r.invoice_id}
          empty="No monthly payments yet."
          columns={[
            { key: "paid", header: "Paid on", render: (r) => paidOn(r.paid_at || r.verified_at) },
            { key: "name", header: "Client", render: (r) => `${r.display_name} (${r.username})` },
            { key: "period", header: "Month", render: (r) => periodLabel(r.period_start, r.period_end) },
            { key: "amount", header: "Amount", render: (r) => rupees(r.amount) },
            { key: "ref", header: "UPI reference", render: (r) => r.paid_ref || "—" },
            { key: "status", header: "Status", render: (r) => STATUS_LABEL[r.status] },
            {
              key: "actions",
              header: "Actions",
              render: (r) =>
                r.status === "paid" ? (
                  <button className={small} onClick={() => setServiceStatus(r, "verified")}>
                    ✅ Received
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">verified {paidOn(r.verified_at)}</span>
                ),
            },
          ]}
        />
      </div>

      {open && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">
            Invoices — {open.display_name} ({open.username})
          </h3>
          <DataTable
            rows={open.invoices}
            rowKey={(r) => r.week_start}
            empty="No completed weeks billed yet."
            columns={[
              { key: "week", header: "Week", render: (r) => weekLabel(r.week_start, r.week_end) },
              { key: "env", header: "Book", render: (r) => r.environment },
              { key: "profit", header: "Profit", render: (r) => rupees(r.profit) },
              { key: "pct", header: "Rate", render: (r) => `${r.pct}%` },
              { key: "amount", header: "Commission", render: (r) => rupees(r.amount) },
              { key: "status", header: "Status", render: (r) => STATUS_LABEL[r.status] },
              { key: "paid", header: "Paid on", render: (r) => (r.paid_at ? r.paid_at.slice(0, 10) : "—") },
              { key: "ref", header: "Reference", render: (r) => r.paid_ref || "—" },
              {
                key: "actions",
                header: "Actions",
                render: (r) => (
                  <div className="flex gap-1">
                    {r.status === "due" && (
                      <button className={small} onClick={() => setQrFor(r)}>
                        QR
                      </button>
                    )}
                    <button
                      className={small}
                      title={r.report_emailed_at ? `Last sent ${paidOn(r.report_emailed_at)}` : "Not sent yet"}
                      onClick={() => emailReport(r)}
                    >
                      📧 {r.report_emailed_at ? "Resend report" : "Email report"}
                    </button>
                    {(r.status === "due" || r.status === "paid") && (
                      <button className={small} onClick={() => setStatus(r, "verified")}>
                        ✅ Received
                      </button>
                    )}
                    {(r.status === "paid" || r.status === "verified") && (
                      <button className={small} onClick={() => setStatus(r, "due")}>
                        ↩️ Reopen
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
          <h3 className="mt-4 mb-2 text-sm font-semibold text-slate-200">
            🖥️ Monthly charges — {open.display_name}
            {open.service.start_date && ` (billed on day ${Number(open.service.start_date.slice(8))} each month)`}
          </h3>
          <DataTable
            rows={open.service.invoices}
            rowKey={(r) => r.period_start}
            empty="No monthly bills yet."
            columns={[
              { key: "period", header: "Month", render: (r) => periodLabel(r.period_start, r.period_end) },
              { key: "server", header: "Server", render: (r) => rupees(r.server_fee) },
              { key: "maint", header: "Maintenance", render: (r) => rupees(r.maintenance_fee) },
              { key: "amount", header: "Total", render: (r) => rupees(r.amount) },
              { key: "status", header: "Status", render: (r) => STATUS_LABEL[r.status] },
              { key: "paid", header: "Paid on", render: (r) => (r.paid_at ? r.paid_at.slice(0, 10) : "—") },
              { key: "ref", header: "Reference", render: (r) => r.paid_ref || "—" },
              {
                key: "actions",
                header: "Actions",
                render: (r) => (
                  <div className="flex gap-1">
                    {r.status === "due" && (
                      <button className={small} onClick={() => setSvcQrFor(r)}>
                        QR
                      </button>
                    )}
                    {(r.status === "due" || r.status === "paid") && (
                      <button className={small} onClick={() => setServiceStatus(r, "verified")}>
                        ✅ Received
                      </button>
                    )}
                    {(r.status === "paid" || r.status === "verified") && (
                      <button className={small} onClick={() => setServiceStatus(r, "due")}>
                        ↩️ Reopen
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {planFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h4 className="mb-3 text-sm font-semibold text-slate-200">
              Monthly charges for {planFor.display_name}
            </h4>
            <label className="mb-3 block text-xs text-slate-400">
              Server cost per month (₹)
              <input
                type="number"
                min={0}
                step="any"
                className={`${input} mt-1 w-full`}
                value={plan.server}
                onChange={(e) => setPlan({ ...plan, server: e.target.value })}
              />
            </label>
            <label className="mb-3 block text-xs text-slate-400">
              Maintenance per month (₹)
              <input
                type="number"
                min={0}
                step="any"
                className={`${input} mt-1 w-full`}
                value={plan.maint}
                onChange={(e) => setPlan({ ...plan, maint: e.target.value })}
              />
            </label>
            <label className="mb-1 block text-xs text-slate-400">
              Start date (billed on this day every month)
              <input
                type="date"
                className={`${input} mt-1 w-full`}
                value={plan.start}
                onChange={(e) => setPlan({ ...plan, start: e.target.value })}
              />
            </label>
            <p className="mb-3 text-[11px] text-slate-500">
              Total {rupees(Number(plan.server || 0) + Number(plan.maint || 0))} a month, billed in advance:
              the first bill appears on the start date (blank = today) with a UPI QR, then again on the same
              day every month. A fee change applies from the next bill; bills already issued keep their
              amount. Set both to 0 to stop billing. The start date can't be moved once a monthly bill has
              been paid.
            </p>
            <div className="flex gap-2">
              <button
                onClick={savePlan}
                className={`${btn} flex-1 bg-indigo-600 text-white hover:bg-indigo-500`}
              >
                Save
              </button>
              <button
                onClick={() => setPlanFor(null)}
                className={`${btn} flex-1 bg-slate-700 text-slate-100 hover:bg-slate-600`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {svcQrFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xs rounded-xl border border-slate-800 bg-slate-900 p-5 text-center">
            <h4 className="mb-1 text-sm font-semibold text-slate-200">
              {svcQrFor.username} · {periodLabel(svcQrFor.period_start, svcQrFor.period_end)}
            </h4>
            <p className="mb-3 text-lg font-semibold text-slate-100">{rupees(svcQrFor.amount)}</p>
            <UpiQr uri={svcQrFor.upi_uri} />
            <button onClick={() => setSvcQrFor(null)} className={`${small} mt-4`}>
              Close
            </button>
          </div>
        </div>
      )}

      {rateFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h4 className="mb-3 text-sm font-semibold text-slate-200">
              Commission for {rateFor.display_name}
            </h4>
            <label className="mb-3 block text-xs text-slate-400">
              Percent of weekly profit (0 = no commission)
              <input
                type="number"
                min={0}
                max={100}
                step="any"
                className={`${input} mt-1 w-full`}
                value={rate.pct}
                onChange={(e) => setRate({ ...rate, pct: e.target.value })}
              />
            </label>
            <label className="mb-1 block text-xs text-slate-400">
              First week to bill (optional)
              <input
                type="date"
                className={`${input} mt-1 w-full`}
                value={rate.from}
                onChange={(e) => setRate({ ...rate, from: e.target.value })}
              />
            </label>
            <p className="mb-3 text-[11px] text-slate-500">
              Leave blank to start with the current week (or keep the existing start when only
              changing the percent). Weeks already invoiced keep the rate they were billed at.
            </p>
            <div className="flex gap-2">
              <button
                onClick={saveRate}
                disabled={rate.pct === ""}
                className={`${btn} flex-1 bg-indigo-600 text-white hover:bg-indigo-500`}
              >
                Save
              </button>
              <button
                onClick={() => setRateFor(null)}
                className={`${btn} flex-1 bg-slate-700 text-slate-100 hover:bg-slate-600`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {qrFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xs rounded-xl border border-slate-800 bg-slate-900 p-5 text-center">
            <h4 className="mb-1 text-sm font-semibold text-slate-200">
              {qrFor.username} · {weekLabel(qrFor.week_start, qrFor.week_end)}
            </h4>
            <p className="mb-3 text-lg font-semibold text-slate-100">{rupees(qrFor.amount)}</p>
            <UpiQr uri={qrFor.upi_uri} />
            <button onClick={() => setQrFor(null)} className={`${small} mt-4`}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
