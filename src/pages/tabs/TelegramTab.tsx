import { useEffect, useState, type FormEvent } from "react"
import DataTable from "../../components/DataTable"
import { api, ApiError } from "../../lib/api"
import { usePolling } from "../../lib/usePolling"

interface TelegramConfig {
  enabled: boolean
  chat_id: string
  post_exits: boolean
  header: string
  footer: string
  token_set: boolean
  token_source: "env" | "panel" | ""
  vault_ready: boolean
  active: boolean
}

interface TgSignal {
  id: string
  symbol: string
  side: "BUY" | "SELL"
  entry: number
  stop: number
  target: number
  status: "OPEN" | "TARGET" | "STOP-LOSS" | "CLOSED" | "CANCELLED"
  source: "auto" | "manual"
  posted_label: string
  exit_price: number | null
  pnl_pct: number | null
  exit_reason: string
  edited: boolean
  message_id: number
  error: string
}

interface TgSignals {
  rows: TgSignal[]
  stats: {
    total: number
    open: number
    targets: number
    stops: number
    closed: number
    win_rate: number | null
    net_pct: number
  }
}

type Msg = { kind: "ok" | "err"; text: string } | null

const input = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
const btn = "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
const small = "rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"

const errText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback

const STATUS_LABEL: Record<TgSignal["status"], string> = {
  OPEN: "🟡 Open",
  TARGET: "✅ Target hit",
  "STOP-LOSS": "❌ SL hit",
  CLOSED: "⏹ Closed",
  CANCELLED: "🚫 Cancelled",
}

export default function TelegramTab() {
  const { data: cfg, refresh: refreshCfg } = usePolling<TelegramConfig>(
    () => api.get<TelegramConfig>("/telegram/config"),
    null,
  )
  const { data: sig, refresh } = usePolling<TgSignals>(
    () => api.get<TgSignals>("/telegram/signals"),
    5000,
  )

  // -- settings form -----------------------------------------------------------
  const [form, setForm] = useState({
    enabled: false,
    chat_id: "",
    post_exits: true,
    header: "",
    footer: "",
    bot_token: "",
  })
  const [cfgMsg, setCfgMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (cfg) setForm((f) => ({ ...f, ...cfg, bot_token: "" }))
  }, [cfg])

  const saveConfig = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setCfgMsg(null)
    try {
      await api.put("/telegram/config", form)
      setCfgMsg({ kind: "ok", text: "Saved." })
      refreshCfg()
    } catch (err) {
      setCfgMsg({ kind: "err", text: errText(err, "Failed to save.") })
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    setBusy(true)
    setCfgMsg(null)
    try {
      const res = await api.post<{ bot: string }>("/telegram/test")
      setCfgMsg({ kind: "ok", text: `Test message sent by @${res.bot}. Check your channel.` })
    } catch (err) {
      setCfgMsg({ kind: "err", text: errText(err, "Test failed.") })
    } finally {
      setBusy(false)
    }
  }

  // -- manual signal -------------------------------------------------------------
  const [manual, setManual] = useState({ symbol: "", side: "BUY", entry: "", stop: "", target: "" })
  const [listMsg, setListMsg] = useState<Msg>(null)

  const postManual = async (e: FormEvent) => {
    e.preventDefault()
    setListMsg(null)
    try {
      await api.post("/telegram/signals", {
        symbol: manual.symbol,
        side: manual.side,
        entry: Number(manual.entry),
        stop: Number(manual.stop),
        target: Number(manual.target),
      })
      setListMsg({ kind: "ok", text: `Posted ${manual.side} ${manual.symbol.toUpperCase()}.` })
      setManual({ symbol: "", side: "BUY", entry: "", stop: "", target: "" })
      refresh()
    } catch (err) {
      setListMsg({ kind: "err", text: errText(err, "Failed to post.") })
    }
  }

  // -- row actions -----------------------------------------------------------------
  const [editing, setEditing] = useState<TgSignal | null>(null)
  const [edit, setEdit] = useState({ stop: "", target: "", notify: true })
  const [closing, setClosing] = useState<TgSignal | null>(null)
  const [closePrice, setClosePrice] = useState("")

  const act = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    setListMsg(null)
    try {
      await fn()
      setListMsg({ kind: "ok", text: ok })
      refresh()
      return true
    } catch (err) {
      setListMsg({ kind: "err", text: errText(err, fail) })
      return false
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    const done = await act(
      () =>
        api.put(`/telegram/signals/${editing.id}`, {
          stop: edit.stop === "" ? null : Number(edit.stop),
          target: edit.target === "" ? null : Number(edit.target),
          notify: edit.notify,
        }),
      `Updated ${editing.symbol} — the channel post was edited.`,
      "Failed to update.",
    )
    if (done) setEditing(null)
  }

  const saveClose = async (cancel: boolean) => {
    if (!closing) return
    const done = await act(
      () =>
        api.post(`/telegram/signals/${closing.id}/close`, {
          price: cancel ? null : Number(closePrice),
          cancel,
        }),
      cancel ? `Cancelled ${closing.symbol}.` : `Closed ${closing.symbol}.`,
      "Failed to close.",
    )
    if (done) setClosing(null)
  }

  const remove = (r: TgSignal) => {
    const fromChannel = window.confirm(
      `Delete ${r.side} ${r.symbol} from the journal.\n\nOK = also delete the post from the Telegram channel\nCancel = keep the post in the channel`,
    )
    act(
      () => api.del(`/telegram/signals/${r.id}?from_channel=${fromChannel}`),
      `Deleted ${r.symbol}${fromChannel ? " (and its channel post)" : ""}.`,
      "Failed to delete.",
    )
  }

  const stats = sig?.stats

  return (
    <div className="space-y-6">
      {/* -- connection ------------------------------------------------------------ */}
      <form onSubmit={saveConfig} className="rounded-lg border border-slate-800 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-200">📣 Telegram Channel</h3>
          <span className={`text-xs ${cfg?.active ? "text-emerald-400" : "text-slate-500"}`}>
            {cfg?.active ? "🟢 Posting signals automatically" : "⚪ Not posting"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            Bot token
            <input
              type="password"
              autoComplete="off"
              className={`${input} mt-1 w-full`}
              disabled={cfg?.token_source === "env"}
              placeholder={
                cfg?.token_source === "env"
                  ? "Set by TELEGRAM_BOT_TOKEN in .env"
                  : cfg?.token_set
                    ? "Saved — leave blank to keep"
                    : "123456:ABC… from @BotFather"
              }
              value={form.bot_token}
              onChange={(e) => setForm({ ...form, bot_token: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-400">
            Channel
            <input
              className={`${input} mt-1 w-full`}
              placeholder="@yourchannel or -100…"
              value={form.chat_id}
              onChange={(e) => setForm({ ...form, chat_id: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-400">
            Header line (optional)
            <input
              className={`${input} mt-1 w-full`}
              placeholder="e.g. WelthWest Signals"
              value={form.header}
              onChange={(e) => setForm({ ...form, header: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-400">
            Footer / disclaimer (optional)
            <input
              className={`${input} mt-1 w-full`}
              placeholder="e.g. Not investment advice."
              value={form.footer}
              onChange={(e) => setForm({ ...form, footer: e.target.value })}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Auto-post every signal
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.post_exits}
              onChange={(e) => setForm({ ...form, post_exits: e.target.checked })}
            />
            Post a reply when SL / Target is hit
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Posts contain only the symbol, BUY/SELL, entry, stop-loss and target — never the strategy
          or why the signal fired. Signals from a simulated feed are never posted. Create a bot
          with @BotFather and add it to your channel as an admin with “Post messages”.
        </p>
        {cfg && !cfg.vault_ready && cfg.token_source !== "env" && (
          <p className="mt-1 text-[11px] text-amber-400">
            ⚠️ CREDENTIALS_KEY is not set on this server, so a token can't be saved here — put
            TELEGRAM_BOT_TOKEN in .env instead.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}>
            Save
          </button>
          <button
            type="button"
            disabled={busy || !cfg?.token_set || !cfg?.chat_id}
            onClick={sendTest}
            className={`${btn} border border-slate-700 text-slate-200 hover:bg-slate-800`}
          >
            Send test message
          </button>
        </div>
        {cfgMsg && (
          <p className={`mt-2 text-xs ${cfgMsg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {cfgMsg.text}
          </p>
        )}
      </form>

      {/* -- stats ------------------------------------------------------------------ */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Signals", stats.total],
            ["Open", stats.open],
            ["Targets hit", stats.targets],
            ["SL hit", stats.stops],
            ["Win rate", stats.win_rate === null ? "—" : `${stats.win_rate}%`],
            ["Net (sum %)", `${stats.net_pct > 0 ? "+" : ""}${stats.net_pct}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-800 p-3">
              <div className="text-[11px] text-slate-500">{label}</div>
              <div className="text-lg font-semibold text-slate-100">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* -- manual post ----------------------------------------------------------------- */}
      <form onSubmit={postManual} className="rounded-lg border border-slate-800 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">✍️ Post a signal manually</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <input
            required
            placeholder="Symbol"
            className={input}
            value={manual.symbol}
            onChange={(e) => setManual({ ...manual, symbol: e.target.value })}
          />
          <select
            className={input}
            value={manual.side}
            onChange={(e) => setManual({ ...manual, side: e.target.value })}
          >
            <option>BUY</option>
            <option>SELL</option>
          </select>
          {(["entry", "stop", "target"] as const).map((k) => (
            <input
              key={k}
              required
              type="number"
              step="any"
              placeholder={k === "stop" ? "Stop-loss" : k[0].toUpperCase() + k.slice(1)}
              className={input}
              value={manual[k]}
              onChange={(e) => setManual({ ...manual, [k]: e.target.value })}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          SL/Target hits are tracked automatically while the bot is running on that symbol;
          otherwise close it yourself below.
        </p>
        <button
          type="submit"
          disabled={!cfg?.token_set || !cfg?.chat_id}
          className={`${btn} mt-3 bg-indigo-600 text-white hover:bg-indigo-500`}
        >
          Post to channel
        </button>
      </form>

      {/* -- journal ---------------------------------------------------------------------- */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Posted signals</h3>
        {listMsg && (
          <p className={`mb-2 text-xs ${listMsg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {listMsg.text}
          </p>
        )}

        {editing && (
          <div className="mb-3 rounded-lg border border-indigo-800 bg-slate-900 p-3">
            <p className="mb-2 text-sm text-slate-200">
              Modify {editing.side} {editing.symbol} (entry {editing.entry})
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                step="any"
                className={input}
                placeholder={`Stop-loss (${editing.stop})`}
                value={edit.stop}
                onChange={(e) => setEdit({ ...edit, stop: e.target.value })}
              />
              <input
                type="number"
                step="any"
                className={input}
                placeholder={`Target (${editing.target})`}
                value={edit.target}
                onChange={(e) => setEdit({ ...edit, target: e.target.value })}
              />
              <label className="flex items-center gap-1 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={edit.notify}
                  onChange={(e) => setEdit({ ...edit, notify: e.target.checked })}
                />
                Notify channel
              </label>
              <button onClick={saveEdit} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}>
                Update
              </button>
              <button onClick={() => setEditing(null)} className={small}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {closing && (
          <div className="mb-3 rounded-lg border border-amber-800 bg-slate-900 p-3">
            <p className="mb-2 text-sm text-slate-200">
              Close {closing.side} {closing.symbol}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                step="any"
                className={input}
                placeholder="Exit price"
                value={closePrice}
                onChange={(e) => setClosePrice(e.target.value)}
              />
              <button
                disabled={!closePrice}
                onClick={() => saveClose(false)}
                className={`${btn} bg-amber-600 text-white hover:bg-amber-500`}
              >
                Close at price
              </button>
              <button onClick={() => saveClose(true)} className={small}>
                Cancel signal (no result)
              </button>
              <button onClick={() => setClosing(null)} className={small}>
                Back
              </button>
            </div>
          </div>
        )}

        <DataTable
          rows={sig?.rows ?? []}
          rowKey={(r) => r.id}
          empty="No signals posted yet."
          columns={[
            { key: "time", header: "Posted", render: (r) => r.posted_label },
            {
              key: "sym",
              header: "Signal",
              render: (r) => (
                <span className={r.side === "BUY" ? "text-emerald-400" : "text-red-400"}>
                  {r.side} {r.symbol}
                  {r.source === "manual" && <span className="ml-1 text-[10px] text-slate-500">manual</span>}
                </span>
              ),
            },
            { key: "entry", header: "Entry", render: (r) => r.entry },
            {
              key: "sl",
              header: "SL",
              render: (r) => (
                <>
                  {r.stop}
                  {r.edited && <span title="Edited" className="ml-1">✏️</span>}
                </>
              ),
            },
            { key: "tp", header: "Target", render: (r) => r.target },
            {
              key: "status",
              header: "Status",
              render: (r) => (
                <div>
                  <div>{STATUS_LABEL[r.status]}</div>
                  {r.status === "CLOSED" && r.exit_reason && (
                    <div className="text-[10px] text-slate-500">{r.exit_reason}</div>
                  )}
                  {r.error && <div className="text-[10px] text-red-400">⚠️ {r.error}</div>}
                </div>
              ),
            },
            { key: "exit", header: "Exit", render: (r) => r.exit_price ?? "—" },
            {
              key: "pnl",
              header: "Result",
              render: (r) =>
                r.pnl_pct === null ? (
                  "—"
                ) : (
                  <span className={r.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {r.pnl_pct > 0 ? "+" : ""}
                    {r.pnl_pct}%
                  </span>
                ),
            },
            {
              key: "actions",
              header: "Actions",
              render: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.status === "OPEN" && (
                    <>
                      <button
                        className={small}
                        onClick={() => {
                          setClosing(null)
                          setEditing(r)
                          setEdit({ stop: "", target: "", notify: true })
                        }}
                      >
                        ✏️ Modify
                      </button>
                      <button
                        className={small}
                        onClick={() => {
                          setEditing(null)
                          setClosing(r)
                          setClosePrice("")
                        }}
                      >
                        ⏹ Close
                      </button>
                    </>
                  )}
                  {!r.message_id && (
                    <button
                      className={small}
                      onClick={() =>
                        act(() => api.post(`/telegram/signals/${r.id}/resend`), `Re-posting ${r.symbol}.`, "Failed to re-post.")
                      }
                    >
                      🔁 Retry post
                    </button>
                  )}
                  <button className={small} onClick={() => remove(r)}>
                    🗑️
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
