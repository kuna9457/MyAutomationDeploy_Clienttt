import { useEffect, useState, type FormEvent } from "react"
import { api, ApiError, setToken } from "../lib/api"

interface Me {
  email_masked: string
  has_email: boolean
  reset_available: boolean
}

/**
 * A signed-in user's own login settings: the email their forgot-password code
 * goes to, and changing their password.
 *
 * Why the email lives here: "Forgot password?" can only mail a code to an
 * address already on file. Before this, only an admin could set it, so a
 * client whose admin skipped it had no way to ever recover their own account.
 */
export default function AccountSettings() {
  const [me, setMe] = useState<Me | null>(null)
  const [email, setEmail] = useState("")
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get<Me>("/account/me").then(setMe).catch(() => {})
  }, [])

  const saveEmail = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setEmailMsg(null)
    try {
      const res = await api.put<{ email_masked: string; has_email: boolean }>(
        "/account/email",
        { email: email.trim() },
      )
      setMe((m) => (m ? { ...m, ...res } : m))
      setEmail("")
      setEmailMsg({
        ok: true,
        text: res.has_email ? `Reset codes will go to ${res.email_masked}.` : "Email removed.",
      })
    } catch (err) {
      setEmailMsg({ ok: false, text: err instanceof ApiError ? err.message : "Could not save." })
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (next !== confirm) {
      setPwdMsg({ ok: false, text: "The two new passwords don't match." })
      return
    }
    setBusy(true)
    setPwdMsg(null)
    try {
      const res = await api.post<{ message: string; access_token: string }>(
        "/account/change-password",
        { current_password: current, new_password: next },
      )
      // The change signs out every other session, including this one's old
      // token — swap in the fresh one or the next request logs us out.
      setToken(res.access_token)
      setCurrent("")
      setNext("")
      setConfirm("")
      setPwdMsg({ ok: true, text: res.message })
    } catch (err) {
      setPwdMsg({ ok: false, text: err instanceof ApiError ? err.message : "Could not change password." })
    } finally {
      setBusy(false)
    }
  }

  const input =
    "mb-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100 outline-none focus:border-indigo-500"
  const btn =
    "w-full rounded-lg bg-slate-700 px-3 py-1.5 text-slate-100 hover:bg-slate-600 disabled:opacity-50"
  const msg = (m: { ok: boolean; text: string } | null) =>
    m && <p className={`mt-1 text-xs ${m.ok ? "text-emerald-400" : "text-red-400"}`}>{m.text}</p>

  return (
    <section className="rounded-lg border border-slate-800 p-3">
      <div className="mb-2 font-medium text-slate-300">🔐 Account</div>

      <form onSubmit={saveEmail} className="mb-4">
        <label className="mb-1 block text-xs text-slate-400">Recovery email</label>
        {me?.has_email ? (
          <p className="mb-2 text-[11px] text-slate-500">Current: {me.email_masked}</p>
        ) : (
          <p className="mb-2 text-[11px] text-amber-400">
            None set — add one so you can reset a forgotten password.
          </p>
        )}
        <input
          type="email"
          className={input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={me?.has_email ? "New email address" : "you@example.com"}
          autoComplete="email"
        />
        <button type="submit" disabled={busy} className={btn}>
          Save email
        </button>
        {msg(emailMsg)}
      </form>

      <form onSubmit={changePassword}>
        <label className="mb-1 block text-xs text-slate-400">Change password</label>
        <input
          type="password"
          className={input}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Current password"
          autoComplete="current-password"
        />
        <input
          type="password"
          className={input}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="New password"
          autoComplete="new-password"
        />
        <input
          type="password"
          className={input}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          autoComplete="new-password"
        />
        <button type="submit" disabled={busy || !current || !next} className={btn}>
          Update password
        </button>
        {msg(pwdMsg)}
      </form>
    </section>
  )
}
