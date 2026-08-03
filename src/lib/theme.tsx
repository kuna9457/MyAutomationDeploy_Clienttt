import { createContext, useCallback, useContext, useEffect, useState } from "react"

export type Theme = "dark" | "light"

const STORAGE_KEY = "welthwest-theme"

function initialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === "dark" || saved === "light") return saved
  // Dark is the app's authored default, so an unset preference keeps the
  // look people already know rather than following the OS.
  return "dark"
}

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}>({ theme: "dark", setTheme: () => {}, toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])
  const toggle = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  )

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext)
}

/** Black/white switch. Sits in the header of every page. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const nextLabel = theme === "dark" ? "light" : "dark"
  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${nextLabel} theme`}
      aria-label={`Switch to ${nextLabel} theme`}
      className="rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  )
}
