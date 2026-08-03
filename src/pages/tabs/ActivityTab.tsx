import { useState } from "react"
import type { BotStatus } from "../../lib/types"

export default function ActivityTab({ status }: { status: BotStatus | null }) {
  const [lines, setLines] = useState(60)

  if (!status || !status.started) {
    return <p className="text-sm text-slate-400">Bot not started.</p>
  }

  const log = status.log ?? []

  return (
    <div>
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
