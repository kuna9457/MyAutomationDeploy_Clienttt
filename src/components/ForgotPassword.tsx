import { useState, type FormEvent } from "react"
import { api, ApiError } from "../lib/api"

/**
 * Forgot-password: request a one-time code by email, then redeem it.
 *
 * Two things this UI is careful about, mirroring the server:
 *  - The "code sent" message is shown for ANY username, because the server
 *    answers identically whether or not the account exists. Saying "no such
 *    user" here would undo that on the client side.
 *  - No session is granted on success. The user is returned to the sign-in
 *    form to use the new password, which proves the change end to end.
 */
export default function ForgotPassword({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"request" | "confirm">("request")
  const [username, setUsername] = useState("")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const requestCode = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      setError("Enter your username.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<{ message: string }>(
        "/account/password-reset/request",
        { username: username.trim() },
      )
      setNotice(res.message)
      setStep("confirm")
    } catch (err) {
      // A 503 here is a real server-side problem (email not configured), and
      // is the one case worth showing verbatim.
      setError(err instanceof ApiError ? err.message : "Could not send a code.")
    } finally {
      setBusy(false)
    }
  }

  const confirmCode = async (e: FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError("The two passwords don't match.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.post("/account/password-reset/confirm", {
        username: username.trim(),
        code: code.trim(),
        new_password: newPassword,
      })
      setNotice("Password updated. Sign in with your new password.")
      setStep("request")
      setCode("")
      setNewPassword("")
      setConfirmPassword("")
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset the password.")
    } finally {
      setBusy(false)
    }
  }

  const field =
    "mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"

  if (step === "request") {
    return (
      <form onSubmit={requestCode}>
        <p className="mb-4 text-sm text-slate-400">
          Enter your username and we'll email a reset code to the address on
          file for your account.
        </p>

        <label className="mb-1 block text-xs font-medium text-slate-400">Username</label>
        <input
          className={field}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        {notice && (
          <div className="mb-3 rounded-lg bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send reset code"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="mt-2 w-full rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
        >
          Back to sign in
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={confirmCode}>
      {notice && (
        <div className="mb-4 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
          {notice}
        </div>
      )}

      <label className="mb-1 block text-xs font-medium text-slate-400">
        Reset code
      </label>
      <input
        className={`${field} tracking-[0.4em]`}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        autoFocus
      />

      <label className="mb-1 block text-xs font-medium text-slate-400">
        New password
      </label>
      <input
        type="password"
        className={field}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        autoComplete="new-password"
      />

      <label className="mb-1 block text-xs font-medium text-slate-400">
        Confirm new password
      </label>
      <input
        type="password"
        className={field}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
      />

      {error && (
        <div className="mb-3 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? "Updating…" : "Set new password"}
      </button>
      <button
        type="button"
        onClick={() => {
          setStep("request")
          setError(null)
        }}
        className="mt-2 w-full rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
      >
        Didn't get a code? Send again
      </button>
    </form>
  )
}
