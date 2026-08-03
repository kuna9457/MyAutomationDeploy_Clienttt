import { useState, type FormEvent } from "react"
import DataTable from "../../components/DataTable"
import ClientStatsPanel from "../../components/ClientStatsPanel"
import { api, ApiError } from "../../lib/api"
import { usePolling } from "../../lib/usePolling"
import type { ClientOverviewRow } from "../../lib/types"

export default function ClientsTab() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [resetTarget, setResetTarget] = useState<ClientOverviewRow | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [statsFor, setStatsFor] = useState<ClientOverviewRow | null>(null)

  const { data: clients, refresh } = usePolling<ClientOverviewRow[]>(
    () => api.get<ClientOverviewRow[]>("/admin/clients-overview"),
    10000,
  )

  const createClient = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await api.post("/admin/users", { username, password, display_name: displayName })
      setMsg({ kind: "ok", text: `Created client '${username}'. Share the username/password with them directly.` })
      setUsername("")
      setPassword("")
      setDisplayName("")
      refresh()
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Failed to create client." })
    } finally {
      setBusy(false)
    }
  }

  const toggleStatus = async (row: ClientOverviewRow) => {
    const next = row.status === "active" ? "disabled" : "active"
    await api.put(`/admin/users/${row.user_id}/status`, { status: next })
    refresh()
  }

  const savePassword = async () => {
    if (!resetTarget || newPassword.length < 6) return
    await api.put(`/admin/users/${resetTarget.user_id}/password`, { password: newPassword })
    setMsg({ kind: "ok", text: `Password updated for '${resetTarget.username}'.` })
    setResetTarget(null)
    setNewPassword("")
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createClient} className="rounded-lg border border-slate-800 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">➕ Create Client Account</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            required
            placeholder="Username"
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            required
            type="text"
            placeholder="Password (min 6 chars)"
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            placeholder="Display name (optional)"
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Create
        </button>
        {msg && (
          <p className={`mt-2 text-xs ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {msg.text}
          </p>
        )}
      </form>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Clients</h3>
        <DataTable
          rows={clients ?? []}
          rowKey={(r) => r.user_id}
          empty="No clients yet — create one above."
          columns={[
            { key: "name", header: "Client", render: (r) => `${r.display_name} (${r.username})` },
            {
              key: "status",
              header: "Status",
              render: (r) => (r.status === "active" ? "🟢 Active" : "🔴 Disabled"),
            },
            {
              key: "running",
              header: "Bot",
              render: (r) => (r.running ? `🟢 Running (${r.environment})` : "⏸️ Stopped"),
            },
            { key: "broker", header: "Broker", render: (r) => r.broker ?? "—" },
            {
              key: "connected",
              header: "Connected",
              render: (r) => (r.broker_connected.length ? r.broker_connected.join(", ") : "—"),
            },
            {
              key: "paper",
              header: "Paper PnL (₹)",
              render: (r) => r.paper_total_pnl.toLocaleString("en-IN"),
            },
            {
              key: "live",
              header: "Live PnL (₹)",
              render: (r) => r.live_total_pnl.toLocaleString("en-IN"),
            },
            {
              key: "actions",
              header: "Actions",
              render: (r) => (
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setStatsFor((cur) => (cur?.user_id === r.user_id ? null : r))
                    }
                    className={`rounded px-2 py-0.5 text-xs ${
                      statsFor?.user_id === r.user_id
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-700 text-slate-100 hover:bg-slate-600"
                    }`}
                  >
                    📊 Stats
                  </button>
                  <button
                    onClick={() => toggleStatus(r)}
                    className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-100 hover:bg-slate-600"
                  >
                    {r.status === "active" ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => setResetTarget(r)}
                    className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-100 hover:bg-slate-600"
                  >
                    Reset password
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      {statsFor && (
        <ClientStatsPanel
          username={statsFor.username}
          displayName={statsFor.display_name}
          onClose={() => setStatsFor(null)}
        />
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h4 className="mb-3 text-sm font-semibold text-slate-200">
              Reset password for {resetTarget.username}
            </h4>
            <input
              type="text"
              placeholder="New password (min 6 chars)"
              className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={savePassword}
                disabled={newPassword.length < 6}
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => { setResetTarget(null); setNewPassword("") }}
                className="flex-1 rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
