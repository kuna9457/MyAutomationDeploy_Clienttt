import { useState, type FormEvent } from "react"
import DataTable from "../../components/DataTable"
import ClientStatsPanel from "../../components/ClientStatsPanel"
import ServerSecretBox from "../../components/ServerSecretBox"
import { api, ApiError } from "../../lib/api"
import type { NewFleetNode } from "../../lib/fleetTypes"
import { usePolling } from "../../lib/usePolling"
import type { ClientOverviewRow } from "../../lib/types"

export default function ClientsTab() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  // Where this client's forgot-password code will be sent. REQUIRED at
  // creation — an account without one can never recover itself. It can be
  // cleared afterwards via the ✉️ action, which is why the list still flags
  // clients that have none.
  const [email, setEmail] = useState("")
  const [emailTarget, setEmailTarget] = useState<ClientOverviewRow | null>(null)
  const [newEmail, setNewEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [resetTarget, setResetTarget] = useState<ClientOverviewRow | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [statsFor, setStatsFor] = useState<ClientOverviewRow | null>(null)
  // The server credentials just issued (at creation, or a new secret) — shown
  // ONCE, because the hub keeps only a hash of the secret.
  const [issued, setIssued] = useState<{ client: string; server: NewFleetNode } | null>(null)

  const { data: clients, refresh } = usePolling<ClientOverviewRow[]>(
    () => api.get<ClientOverviewRow[]>("/admin/clients-overview"),
    10000,
  )

  const createClient = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    setIssued(null)
    try {
      const res = await api.post<{ server?: NewFleetNode; server_error?: string }>(
        "/admin/users",
        { username, password, display_name: displayName, email },
      )
      if (res.server) setIssued({ client: username, server: res.server })
      setMsg(
        res.server_error
          ? { kind: "err", text: `${res.server_error} Use “Create server” on their row.` }
          : {
              kind: "ok",
              text: `Created client '${username}' and their server. Set up the server with the lines below, then give the client their login address, username and password — they can reset the password themselves via ${email}.`,
            },
      )
      setUsername("")
      setPassword("")
      setDisplayName("")
      setEmail("")
      refresh()
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Failed to create client." })
    } finally {
      setBusy(false)
    }
  }

  const createServer = async (row: ClientOverviewRow) => {
    setMsg(null)
    try {
      const server = await api.post<NewFleetNode>(`/admin/users/${row.user_id}/server`)
      setIssued({ client: row.username, server })
      refresh()
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Failed to create the server." })
    }
  }

  const newSecret = async (row: ClientOverviewRow) => {
    if (
      !window.confirm(
        `Issue a new secret for ${row.username}'s server?\n\nThe old one stops working immediately and the server disconnects until you put the new secret in its .env.`,
      )
    ) {
      return
    }
    setMsg(null)
    try {
      const server = await api.post<NewFleetNode>(`/admin/users/${row.user_id}/server/secret`)
      setIssued({ client: row.username, server })
      refresh()
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Failed to issue a new secret." })
    }
  }

  const toggleStatus = async (row: ClientOverviewRow) => {
    const next = row.status === "active" ? "disabled" : "active"
    await api.put(`/admin/users/${row.user_id}/status`, { status: next })
    refresh()
  }

  const saveEmail = async () => {
    if (!emailTarget) return
    try {
      await api.put(`/admin/users/${emailTarget.user_id}/email`, { email: newEmail })
      setMsg({ kind: "ok", text: `Reset email updated for '${emailTarget.username}'.` })
      setEmailTarget(null)
      setNewEmail("")
      refresh()
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Failed to save email." })
    }
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <input
            required
            type="email"
            placeholder="Email (required)"
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Username, password and email are all required. The email is how this
          client resets their own password by OTP if they forget it — without
          one, only you can reset it for them.
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          🖥️ Every client gets their own server, created with the account — one
          client, one server. Their bot runs only there, from its static IP.
        </p>
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

      {issued && (
        <ServerSecretBox
          server={issued.server}
          forClient={issued.client}
          onDone={() => setIssued(null)}
        />
      )}

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
              render: (r) =>
                r.running
                  ? `🟢 Running (${r.environment})${r.node ? ` · ${r.node}` : ""}`
                  : "⏸️ Stopped",
            },
            {
              key: "server",
              header: "Server",
              render: (r) =>
                r.server ? (
                  <div>
                    <div className="text-slate-200">{r.server.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {r.server.connected ? (
                        <span className="text-emerald-400">🟢 connected</span>
                      ) : r.server.last_connected_at ? (
                        "⚪ offline"
                      ) : (
                        <span className="text-amber-400">⚪ never connected — set it up</span>
                      )}{" "}
                      · {r.server.node_id}
                    </div>
                  </div>
                ) : (
                  <span className="text-amber-400">⚠️ none — can't trade</span>
                ),
            },
            {
              key: "email",
              header: "Reset email",
              // A missing address is worth flagging: that client is locked
              // out of self-serve reset until you add one.
              render: (r) =>
                r.email ? r.email : <span className="text-amber-400">⚠️ none</span>,
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
                  {r.server ? (
                    <button
                      onClick={() => newSecret(r)}
                      title="Issue a new server secret (e.g. the old one was lost)"
                      className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-100 hover:bg-slate-600"
                    >
                      🔑 New secret
                    </button>
                  ) : (
                    <button
                      onClick={() => createServer(r)}
                      className="rounded bg-amber-700 px-2 py-0.5 text-xs text-white hover:bg-amber-600"
                    >
                      🖥️ Create server
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEmailTarget(r)
                      setNewEmail(r.email ?? "")
                    }}
                    className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-100 hover:bg-slate-600"
                  >
                    ✉️ Email
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

      {emailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h4 className="mb-1 text-sm font-semibold text-slate-200">
              Reset email for {emailTarget.username}
            </h4>
            <p className="mb-3 text-[11px] text-slate-500">
              Where their forgot-password code is sent. Leave blank to remove
              it — they'll then need you to reset their password for them.
            </p>
            <input
              type="email"
              placeholder="name@example.com"
              className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={saveEmail}
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
              >
                Save
              </button>
              <button
                onClick={() => { setEmailTarget(null); setNewEmail("") }}
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
