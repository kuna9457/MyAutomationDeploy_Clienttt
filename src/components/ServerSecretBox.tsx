import { BASE_URL } from "../lib/api"
import type { NewFleetNode } from "../lib/fleetTypes"

/** The four .env lines a client's server needs, shown ONCE.
 *
 *  The secret is stored on the hub only as a hash, so this is the one moment
 *  it can be copied — after this, the only way back is "New secret". */
export default function ServerSecretBox({
  server,
  forClient,
  onDone,
}: {
  server: NewFleetNode
  forClient: string
  onDone: () => void
}) {
  const hubUrl = BASE_URL.replace(/\/$/, "")
  const envBlock = `NODE_MODE=worker\nHUB_URL=${hubUrl}\nNODE_ID=${server.node_id}\nNODE_SECRET=${server.secret}`

  return (
    <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-3">
      <div className="text-sm font-medium text-amber-200">
        🖥️ Server for “{forClient}” — copy this now. The secret is shown once.
      </div>
      <p className="mt-1 text-[11px] text-amber-100/70">
        Paste these four lines into <code>backend/.env</code> on this client's own server (the one with
        their static IP), then restart it. The client never needs these — give them only their login
        address, username and password.
      </p>
      <pre className="mt-2 overflow-x-auto rounded bg-slate-950 p-2 text-xs text-slate-200">{envBlock}</pre>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => navigator.clipboard?.writeText(envBlock + "\n")}
          className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
        >
          Copy
        </button>
        <button
          onClick={onDone}
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
        >
          I've saved it
        </button>
      </div>
      {!hubUrl.startsWith("https://") && (
        <p className="mt-2 text-[11px] text-red-300">
          ⚠️ This panel isn't on https, so the server would send its secret in clear text. Serve the hub over
          TLS before connecting real servers.
        </p>
      )}
    </div>
  )
}
