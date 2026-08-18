import { useEffect, useState } from "react"
import { api, ApiError } from "../lib/api"

/** Save / load a named bucket of symbols.
 *
 *  Backed by the watchlists store that already existed server-side
 *  (GET/POST/DELETE /config/watchlists) and had no UI at all. Nothing new is
 *  persisted here — a bucket saved from this bar is the same document the live
 *  bot's instrument picker would read, so the two can share buckets.
 *
 *  Loading REPLACES the current selection rather than merging. Merging quietly
 *  builds a bucket that is neither the one you saved nor the one you picked,
 *  and you cannot tell which by looking; replacing is at least honest, and the
 *  previous selection is one click away via Undo.
 */
export default function SymbolBucketBar({
  selected,
  onLoad,
  known,
  disabled,
}: {
  selected: string[]
  onLoad: (symbols: string[]) => void
  /** Symbols that currently exist. A saved bucket may name an instrument that
   *  has since left the universe; those are reported rather than loaded. */
  known: Set<string>
  disabled?: boolean
}) {
  const [buckets, setBuckets] = useState<Record<string, string[]>>({})
  const [name, setName] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [undo, setUndo] = useState<string[] | null>(null)

  const refresh = () =>
    api
      .get<Record<string, string[]>>("/config/watchlists")
      .then(setBuckets)
      .catch(() => setBuckets({}))

  useEffect(() => {
    refresh()
  }, [])

  const save = async () => {
    const clean = name.trim()
    if (!clean || selected.length === 0) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const res = await api.post<{ ok: boolean }>("/config/watchlists", {
        name: clean,
        symbols: selected,
      })
      if (!res.ok) {
        setError("The server rejected that — a bucket needs a name and at least one symbol.")
        return
      }
      await refresh()
      setName("")
      setMsg(
        buckets[clean]
          ? `Replaced “${clean}” with ${selected.length} symbols.`
          : `Saved “${clean}” — ${selected.length} symbols.`,
      )
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the bucket.")
    } finally {
      setBusy(false)
    }
  }

  const load = (bucketName: string) => {
    const saved = buckets[bucketName] ?? []
    const usable = saved.filter((s) => known.has(s))
    const missing = saved.filter((s) => !known.has(s))
    setUndo(selected)
    onLoad(usable)
    setError(null)
    setMsg(
      missing.length
        ? `Loaded ${usable.length} from “${bucketName}”. Skipped ${missing.length} no longer in the instrument list: ${missing.join(", ")}.`
        : `Loaded ${usable.length} symbols from “${bucketName}”.`,
    )
  }

  const remove = async (bucketName: string) => {
    setBusy(true)
    try {
      await api.del(`/config/watchlists/${encodeURIComponent(bucketName)}`)
      await refresh()
      setMsg(`Deleted “${bucketName}”.`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete.")
    } finally {
      setBusy(false)
    }
  }

  const names = Object.keys(buckets).sort()
  const lock = busy || disabled
  const exists = names.includes(name.trim())

  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-400">
          Saved symbol buckets
        </span>
        {undo && (
          <button
            onClick={() => {
              onLoad(undo)
              setUndo(null)
              setMsg("Reverted to the previous selection.")
            }}
            className="text-[11px] text-sky-400 hover:underline"
          >
            undo load
          </button>
        )}
      </div>

      {names.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {names.map((n) => (
            <span
              key={n}
              className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-200"
            >
              <button
                onClick={() => load(n)}
                disabled={lock}
                title={`${buckets[n].length} symbols: ${buckets[n].join(", ")}`}
                className="hover:text-sky-300 disabled:opacity-50"
              >
                {n}
                <span className="ml-1 text-slate-500">({buckets[n].length})</span>
              </button>
              <button
                onClick={() => remove(n)}
                disabled={lock}
                aria-label={`Delete ${n}`}
                className="text-slate-600 hover:text-red-400 disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-[11px] text-slate-600">
          None saved yet. Pick some symbols and name them below.
        </p>
      )}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Name this selection…"
          disabled={lock}
          className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
        />
        <button
          onClick={save}
          disabled={lock || !name.trim() || selected.length === 0}
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
        >
          {exists ? `Replace (${selected.length})` : `Save ${selected.length}`}
        </button>
      </div>

      {msg && <p className="mt-1 text-[11px] text-slate-400">{msg}</p>}
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
