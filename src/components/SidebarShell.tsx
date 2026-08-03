import { useEffect } from "react"

/** Makes a fixed-width sidebar usable on a phone.
 *
 *  Below `lg` the sidebar becomes an off-canvas drawer with a tap-to-dismiss
 *  backdrop; from `lg` up it is an ordinary static column again, exactly as
 *  before. The sidebar components themselves are unchanged — this only wraps
 *  them, so Sidebar/ClientSidebar stay free of layout concerns. */
export default function SidebarShell({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  // Escape closes the drawer. Only bound while it's open, and only matters on
  // mobile — on desktop `open` stays false and the sidebar is static anyway.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // Stop the page behind the drawer from scrolling while it's open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {children}
      </div>
    </>
  )
}

/** The hamburger that opens it. Hidden from `lg` up. */
export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open controls"
      className="rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800 lg:hidden"
    >
      ☰
    </button>
  )
}
