import { useEffect, useState, type FormEvent } from "react"
import DataTable from "../../components/DataTable"
import UpiQr from "../../components/UpiQr"
import { api, ApiError } from "../../lib/api"
import {
  rupees,
  STATUS_LABEL,
  weekLabel,
  type CommissionInvoice,
  type CommissionOverview,
  type CommissionSettings,
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
                    onClick={() => setOpenFor(openFor === r.username ? "" : r.username)}
                  >
                    🧾 Invoices ({r.invoices.length})
                  </button>
                </div>
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
