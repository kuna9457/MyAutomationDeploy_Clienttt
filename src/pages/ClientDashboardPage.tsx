import { useState } from "react"
import ClientSidebar from "../components/ClientSidebar"
import Brand from "../components/Brand"
import SidebarShell, { SidebarToggle } from "../components/SidebarShell"
import { api } from "../lib/api"
import { useAuth } from "../lib/auth"
import { phaseLabel } from "../lib/modes"
import { ThemeToggle } from "../lib/theme"
import { usePolling } from "../lib/usePolling"
import type { BotStatus } from "../lib/types"
import LiveDashboardTab from "./tabs/LiveDashboardTab"
import HoldingsTab from "./tabs/HoldingsTab"
import ActivityTab from "./tabs/ActivityTab"
import TradeLogTab from "./tabs/TradeLogTab"

const TABS = [
  { key: "dashboard", label: "🖥️ Live Dashboard" },
  { key: "holdings", label: "📌 Holdings" },
  { key: "activity", label: "📝 Activity Log" },
  { key: "trades", label: "📒 Trade Log & Analytics" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default function ClientDashboardPage() {
  const { username, logout } = useAuth()
  const [tab, setTab] = useState<TabKey>("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { data: status, refresh } = usePolling<BotStatus>(
    () => api.get<BotStatus>("/bot/status"),
    2000,
  )

  return (
    <div className="flex h-dvh flex-col bg-slate-950">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-800 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarToggle onClick={() => setSidebarOpen(true)} />
          <div className="min-w-0">
            <Brand />
            {status?.started && (
              <p className="text-xs break-words text-slate-500">
                Environment: <strong className="text-slate-300">{status.environment}</strong>
                {" · "}
                Phase: <strong className="text-slate-300">{phaseLabel(status.mode)}</strong>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400 sm:gap-3">
          <span className="hidden max-w-32 truncate sm:inline">{username}</span>
          <ThemeToggle />
          <button
            onClick={logout}
            className="rounded-lg border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <SidebarShell open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <ClientSidebar status={status} onChanged={refresh} />
        </SidebarShell>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-800">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition sm:px-4 ${
                  tab === t.key
                    ? "border-b-2 border-indigo-500 text-indigo-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "dashboard" && <LiveDashboardTab status={status} showStrategy={false} />}
          {tab === "holdings" && <HoldingsTab status={status} onChanged={refresh} />}
          {tab === "activity" && <ActivityTab status={status} showStrategy={false} />}
          {tab === "trades" && <TradeLogTab showStrategy={false} />}
        </main>
      </div>
    </div>
  )
}
