/** Every backend this UI may talk to.
 *
 *  VITE_API_BASE_URLS (comma-separated) lets ONE client UI — e.g.
 *  algo.welthwest.com — front every client's own server. At login the UI
 *  finds which of them is this user's home (see login() below) and from then
 *  on talks ONLY to that one. Absent, the single VITE_API_BASE_URL is used
 *  exactly as before, so the admin panel and any one-server setup are
 *  unchanged. */
const API_BASES: string[] = (
  import.meta.env.VITE_API_BASE_URLS ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000"
)
  .split(",")
  .map((s: string) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean)

/** The first configured backend — the hub, for the admin panel. */
const BASE_URL = API_BASES[0]

const API_BASE_KEY = "api_base"

/** The backend THIS session talks to: the one chosen at login, provided it is
 *  still in the configured list (a removed server is never reused). */
export function apiBase(): string {
  const saved = localStorage.getItem(API_BASE_KEY)
  return saved && API_BASES.includes(saved) ? saved : API_BASES[0]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function getToken(): string | null {
  return localStorage.getItem("access_token")
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("access_token", token)
  else localStorage.removeItem("access_token")
}

// Every key auth.tsx's AuthProvider reads to decide isAuthenticated. Clearing
// ONLY access_token (the old behavior) left username/role behind, so
// isAuthenticated stayed true, LoginPage bounced straight back to "/", its
// components re-fired their now-token-less requests, and the 401 repeated
// forever — an infinite redirect loop hammering the backend. All three must
// go together, from the one place a 401 is handled.
export function clearAuthStorage() {
  localStorage.removeItem("access_token")
  localStorage.removeItem("username")
  localStorage.removeItem("role")
  // The server choice belongs to the session: the next login re-decides it,
  // so a different user on the same browser is never sent to the last one's.
  localStorage.removeItem(API_BASE_KEY)
}

let redirectingToLogin = false

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof URLSearchParams)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  }
  const res = await fetch(`${apiBase()}${path}`, { ...options, headers })
  if (res.status === 401) {
    clearAuthStorage()
    // Multiple in-flight requests can all land here at once (several
    // components poll independently) — only the first should trigger a
    // navigation; the rest just fail quietly instead of stacking up
    // redundant redirects.
    if (!redirectingToLogin) {
      redirectingToLogin = true
      window.location.assign("/login")
    }
    throw new ApiError(401, "Session expired — please log in again.")
  }
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = body.detail || message
    } catch {
      /* body wasn't JSON — keep statusText */
    }
    throw new ApiError(res.status, message)
  }
  if (res.headers.get("content-type")?.includes("application/json")) {
    return res.json() as Promise<T>
  }
  return res as unknown as T
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
}

type LoginResult = { access_token: string; role: string; username: string }

export async function login(username: string, password: string): Promise<LoginResult> {
  const form = new URLSearchParams()
  form.set("username", username)
  form.set("password", password)
  if (API_BASES.length === 1) {
    // One backend: exactly the original behaviour.
    return request<LoginResult>("/auth/login", { method: "POST", body: form })
  }
  return loginAcrossServers(form)
}

/** Fetch with a deadline, so one unreachable server can't stall the login. */
async function fetchWithin(url: string, init: RequestInit, ms = 8000): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Several servers, one shared user database: the login succeeds on every one
 *  of them, but only ONE is this user's home — the server their bot runs on.
 *
 *  So: log in on all of them in parallel, ask each that accepted "are you my
 *  home?" (GET /auth/home, answered from the shared server registry), and keep
 *  that one — its address and its token. Preference: home=true, then a server
 *  that couldn't say, then simply the first that accepted.
 *
 *  Deliberately NOT through request(): its 401 handling clears the session and
 *  redirects, and a "no" from a server that isn't this user's is expected here.
 *
 *  The password goes to every listed server — all of them are yours and on
 *  HTTPS; list only servers you run. */
async function loginAcrossServers(form: URLSearchParams): Promise<LoginResult> {
  const attempts = await Promise.allSettled(
    API_BASES.map(async (base) => {
      const res = await fetchWithin(`${base}/auth/login`, { method: "POST", body: form })
      if (!res.ok) throw new ApiError(res.status, res.status === 401 ? "Invalid username or password." : res.statusText)
      return { base, result: (await res.json()) as LoginResult }
    }),
  )
  const accepted = attempts.flatMap((a) => (a.status === "fulfilled" ? [a.value] : []))

  if (accepted.length === 0) {
    const rejected = attempts.flatMap((a) => (a.status === "rejected" ? [a.reason] : []))
    const wrongPassword = rejected.some((r) => r instanceof ApiError && r.status === 401)
    throw new ApiError(
      wrongPassword ? 401 : 503,
      wrongPassword ? "Invalid username or password." : "Could not reach the server — try again shortly.",
    )
  }

  const homes = await Promise.all(
    accepted.map(async (a) => {
      try {
        const res = await fetchWithin(`${a.base}/auth/home`, {
          headers: { Authorization: `Bearer ${a.result.access_token}` },
        })
        if (!res.ok) return { ...a, home: null as boolean | null }
        return { ...a, home: Boolean((await res.json()).home) }
      } catch {
        return { ...a, home: null as boolean | null }
      }
    }),
  )
  const chosen =
    homes.find((h) => h.home === true) ?? homes.find((h) => h.home === null) ?? homes[0]
  localStorage.setItem(API_BASE_KEY, chosen.base)
  return chosen.result
}

export async function downloadFile(path: string, suggestedName: string) {
  const token = getToken()
  const res = await fetch(`${apiBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new ApiError(res.status, "Export failed.")
  const disposition = res.headers.get("content-disposition") || ""
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : suggestedName
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export { BASE_URL }
