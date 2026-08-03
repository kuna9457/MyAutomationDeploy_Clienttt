import { createContext, useContext, useState, type ReactNode } from "react"
import { clearAuthStorage, login as apiLogin, setToken } from "./api"

interface AuthState {
  username: string | null
  role: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(
    () => localStorage.getItem("username"),
  )
  const [role, setRole] = useState<string | null>(() => localStorage.getItem("role"))

  const login = async (u: string, p: string) => {
    const res = await apiLogin(u, p)
    setToken(res.access_token)
    localStorage.setItem("username", res.username)
    localStorage.setItem("role", res.role)
    setUsername(res.username)
    setRole(res.role)
  }

  const logout = () => {
    clearAuthStorage()
    setUsername(null)
    setRole(null)
  }

  return (
    <AuthContext.Provider
      value={{ username, role, isAuthenticated: !!username, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
