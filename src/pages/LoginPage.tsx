import { useEffect, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import Brand from "../components/Brand"
import ForgotPassword from "../components/ForgotPassword"
import { useAuth } from "../lib/auth"
import { api, ApiError } from "../lib/api"
import { ThemeToggle } from "../lib/theme"

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  // Only offer the link when this server can actually send mail — otherwise
  // it leads to a dead end. The check says nothing about any account.
  const [resetAvailable, setResetAvailable] = useState(false)

  useEffect(() => {
    api
      .get<{ available: boolean }>("/account/password-reset/available")
      .then((r) => setResetAvailable(r.available))
      .catch(() => setResetAvailable(false))
  }, [])

  if (isAuthenticated) {
    navigate("/", { replace: true })
    return null
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username, password)
      navigate("/", { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed.")
    } finally {
      setBusy(false)
    }
  }

  if (forgot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8">
          <div className="mb-1 flex items-start justify-between gap-2">
            <Brand size="lg" />
            <ThemeToggle />
          </div>
          <p className="mb-6 text-sm text-slate-400">Reset your password</p>
          <ForgotPassword onDone={() => setForgot(false)} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8"
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <Brand size="lg" />
          <ThemeToggle />
        </div>
        <p className="mb-6 text-sm text-slate-400">Sign in to continue</p>

        <label className="mb-1 block text-xs font-medium text-slate-400">Username</label>
        <input
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <label className="mb-1 block text-xs font-medium text-slate-400">Password</label>
        <input
          type="password"
          className="mb-6 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && (
          <div className="mb-4 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        {resetAvailable && (
          <button
            type="button"
            onClick={() => {
              setForgot(true)
              setError(null)
            }}
            className="mt-3 w-full text-center text-sm text-slate-400 hover:text-indigo-400"
          >
            Forgot password?
          </button>
        )}
      </form>
    </div>
  )
}
