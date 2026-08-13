import { useEffect, useRef, useState } from "react"

/** A numeric input you can actually CLEAR.
 *
 *  The obvious version is broken:
 *
 *      value={n} onChange={e => setN(Number(e.target.value))}
 *
 *  Clearing the box makes `e.target.value` an empty string, `Number("")` is 0,
 *  so state becomes 0 and the field re-renders showing "0". Every attempt to
 *  delete it puts it straight back — you can never type a fresh number without
 *  first selecting the stray zero.
 *
 *  The fix is to keep the TEXT the user is typing separate from the NUMBER the
 *  form holds. An empty box is a legal editing state that reports `emptyValue`
 *  upward without forcing that value back into the box. On blur the field
 *  normalises, so you are never left staring at a blank that silently means 0.
 */
export default function NumberInput({
  value,
  onChange,
  emptyValue = 0,
  min,
  max,
  step,
  className = "",
  disabled,
  placeholder,
  ariaLabel,
  title,
}: {
  value: number
  onChange: (v: number) => void
  /** What an empty box means to the form. Usually 0 ("no limit" here). */
  emptyValue?: number
  min?: number
  max?: number
  step?: number
  className?: string
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  title?: string
}) {
  const [draft, setDraft] = useState<string>(
    value === null || value === undefined ? "" : String(value),
  )
  // What we last reported upward. Lets us tell our own echo apart from a
  // genuine external change (a preset load, a fetched risk limit).
  const emitted = useRef<number>(value)

  useEffect(() => {
    // Only pull the external value down when it differs from what this box
    // already means. Without this guard, reporting `emptyValue` for an empty
    // box would come straight back as "0" and overwrite the box the user is
    // still editing — the exact bug this component exists to fix.
    if (value === emitted.current) return
    emitted.current = value
    setDraft(value === null || value === undefined ? "" : String(value))
  }, [value])

  const handle = (raw: string) => {
    setDraft(raw)
    if (raw.trim() === "") {
      emitted.current = emptyValue
      onChange(emptyValue)
      return
    }
    // "-", "." and "1e" are valid things to be part-way through typing. Report
    // nothing for them rather than emitting NaN.
    const n = Number(raw)
    if (Number.isNaN(n)) return
    emitted.current = n
    onChange(n)
  }

  const normalise = () => {
    if (draft.trim() === "" || Number.isNaN(Number(draft))) {
      setDraft(String(emptyValue))
      emitted.current = emptyValue
      onChange(emptyValue)
      return
    }
    // Drop typing artefacts ("007", "5.") so the box shows what the form holds.
    const n = Number(draft)
    setDraft(String(n))
    emitted.current = n
    onChange(n)
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      value={draft}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      title={title}
      onChange={(e) => handle(e.target.value)}
      onBlur={normalise}
      className={className}
    />
  )
}
