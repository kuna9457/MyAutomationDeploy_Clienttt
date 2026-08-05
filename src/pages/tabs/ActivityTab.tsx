import { useState } from "react"
import PlatformSignals from "../../components/PlatformSignals"
import type { BotStatus } from "../../lib/types"

export default function ActivityTab({
  status,
  showStrategy = true,
}: {
  status: BotStatus | null
  /** Admin sees why each signal fired; a client sees execution only. */
  showStrategy?: boolean
}) {
  const [lines, setLines] = useState(60)

  // The platform's signals show even with this account's bot stopped — a
  // client who logs in mid-session can see what is being traded around them
  // rather than a bare "Bot not started". Their OWN log below still only
  // exists once they have started.
  if (!status || !status.started) {
    return (
      <div>
        <PlatformSignals showReason={showStrategy} />
        <p className="text-sm text-slate-400">
          Your bot isn't started, so nothing has been placed in your account
          yet. Press <strong className="text-slate-300">Start Bot</strong> to
          begin trading these signals with your own capital.
        </p>
      </div>
    )
  }

  const log = status.log ?? []

  return (
    <div>
      <PlatformSignals showReason={showStrategy} />
      <h3 className="mb-1 text-sm font-semibold text-slate-200">📝 Activity Log</h3>
      <p className="mb-3 text-xs text-slate-500">
        Newest first. Entries, exits, rejections and feed problems.
      </p>
      <label className="mb-2 flex items-center gap-2 text-xs text-slate-400">
        Lines to show: {lines}
        <input
          type="range"
          min={20}
          max={200}
          step={20}
          value={lines}
          onChange={(e) => setLines(Number(e.target.value))}
          className="w-40"
        />
      </label>
      <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
        {log.slice(0, lines).join("\n") || "—"}
      </pre>
      <p className="mt-2 text-xs text-slate-500">
        {status.running ? "🔄 Live — refreshing every few seconds" : "⏸️ Bot stopped."}
      </p>
    </div>
  )
}
