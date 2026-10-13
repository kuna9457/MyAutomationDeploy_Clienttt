import { useState } from "react"
import DataTable from "../../components/DataTable"
import UpiQr from "../../components/UpiQr"
import { api, ApiError } from "../../lib/api"
import {
  rupees,
  STATUS_LABEL,
  weekLabel,
  type ClientCommission,
  type CommissionInvoice,
} from "../../lib/commissionTypes"
import { usePolling } from "../../lib/usePolling"

export default function ClientCommissionTab() {
  const { data, error, refresh } = usePolling<ClientCommission>(
    () => api.get<ClientCommission>("/commission/me"),
    60000,
  )
  const [refs, setRefs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  if (!data) {
    return <p className="text-sm text-slate-500">{error ?? "Loading…"}</p>
  }

  const due = data.invoices.filter((i) => i.status === "due")
  const week = data.current_week

  const markPaid = async (inv: CommissionInvoice) => {
    if (
      !window.confirm(
        `Mark ${rupees(inv.amount)} for ${weekLabel(inv.week_start, inv.week_end)} as paid?\n\nOnly do this after the UPI payment has gone through.`,
      )
    ) {
      return
    }
    setBusy(inv.week_start)
    setMsg(null)
    try {
      await api.post(`/commission/me/invoices/${inv.week_start}/paid`, {
        reference: refs[inv.week_start] ?? "",
      })
      setMsg({ kind: "ok", text: `Marked ${rupees(inv.amount)} as paid. Thank you.` })
      refresh()
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Could not mark it paid." })
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Your commission rate", data.commission_pct > 0 ? `${data.commission_pct}% of weekly profit` : "Not set"],
          ["Due now", rupees(data.total_due)],
          ["This week's profit so far", rupees(week.profit)],
          ["Accruing this week", rupees(week.accrued)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-800 p-3">
            <div className="text-[11px] text-slate-500">{label}</div>
            <div className="text-lg font-semibold text-slate-100">{value}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        Commission is {data.commission_pct}% of the profit the bot books for you in a
        Monday–Sunday week ({data.environment} trades), payable the following Monday. A week that
        ends in a loss owes nothing. This week ({weekLabel(week.week_start, week.week_end)}) becomes
        payable on {week.payable_on}.
      </p>

      {msg && (
        <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}

      {due.length === 0 ? (
        <div className="rounded-lg border border-slate-800 p-4 text-sm text-slate-300">
          ✅ Nothing to pay right now.
        </div>
      ) : (
        due.map((inv) => (
          <div
            key={inv.week_start}
            className="flex flex-col gap-5 rounded-lg border border-amber-800 p-4 sm:flex-row sm:items-center"
          >
            <UpiQr uri={inv.upi_uri} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="text-xs text-slate-400">
                Week of {weekLabel(inv.week_start, inv.week_end)}
              </div>
              <div className="text-2xl font-semibold text-slate-100">{rupees(inv.amount)}</div>
              <div className="text-sm text-slate-300">
                {inv.pct}% of {rupees(inv.profit)} profit ({inv.trades} trades)
              </div>
              <div className="text-xs break-all text-slate-400">
                Pay to <strong className="text-slate-200">{data.payee_name}</strong> · UPI ID{" "}
                <strong className="text-slate-200">{data.upi_id}</strong>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  placeholder="UPI reference no. (optional)"
                  maxLength={40}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                  value={refs[inv.week_start] ?? ""}
                  onChange={(e) => setRefs({ ...refs, [inv.week_start]: e.target.value })}
                />
                <button
                  disabled={busy === inv.week_start}
                  onClick={() => markPaid(inv)}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  I've paid — mark as done
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Weekly history</h3>
        <DataTable
          rows={data.invoices}
          rowKey={(r) => r.week_start}
          empty="No completed weeks yet."
          columns={[
            { key: "week", header: "Week", render: (r) => weekLabel(r.week_start, r.week_end) },
            {
              key: "profit",
              header: "Profit",
              render: (r) => (
                <span className={r.profit >= 0 ? "text-emerald-400" : "text-red-400"}>{rupees(r.profit)}</span>
              ),
            },
            { key: "pct", header: "Rate", render: (r) => `${r.pct}%` },
            { key: "amount", header: "Commission", render: (r) => rupees(r.amount) },
            { key: "status", header: "Status", render: (r) => STATUS_LABEL[r.status] },
            { key: "paid", header: "Paid on", render: (r) => (r.paid_at ? r.paid_at.slice(0, 10) : "—") },
            { key: "ref", header: "Reference", render: (r) => r.paid_ref || "—" },
          ]}
        />
      </div>
    </div>
  )
}
