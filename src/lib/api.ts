const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"

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
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
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

export async function login(username: string, password: string) {
  const form = new URLSearchParams()
  form.set("username", username)
  form.set("password", password)
  return request<{ access_token: string; role: string; username: string }>("/auth/login", {
    method: "POST",
    body: form,
  })
}

export async function downloadFile(path: string, suggestedName: string) {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
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
