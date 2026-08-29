import { Component, type ErrorInfo, type ReactNode } from "react"

/**
 * Catches render/lifecycle errors from a subtree and shows them, instead of
 * letting React unmount the entire application.
 *
 * WHY THIS EXISTS
 * React's default behaviour for an uncaught error in a component is to unmount
 * the WHOLE tree — which renders as a blank white page with nothing in the UI
 * to say what happened. One bad tab could therefore take down the dashboard,
 * the trade log and the bot controls all at once, and the only clue was in the
 * browser console.
 *
 * A boundary around each tab keeps a failure local: the rest of the app keeps
 * working, and the broken panel says what broke. That matters most for a
 * trading UI, where "I can still see my open positions" is not a nice-to-have.
 */
interface Props {
  children: ReactNode
  /** Shown in the fallback so the user knows which panel failed. */
  name?: string
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the full component stack in the console for debugging; the UI shows
    // the short version.
    console.error(`[ErrorBoundary${this.props.name ? `: ${this.props.name}` : ""}]`,
                  error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="rounded-xl border border-rose-800 bg-rose-950/30 p-4">
        <div className="mb-1 font-semibold text-rose-200">
          ⚠ {this.props.name ?? "This panel"} failed to render
        </div>
        <p className="mb-2 text-sm text-rose-200/80">
          The rest of the app is unaffected. Switch tabs to keep working, or
          reload to try again.
        </p>
        <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950/70 p-2 text-xs text-rose-300">
          {error.message}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-2 rounded-lg border border-rose-700 px-3 py-1 text-sm text-rose-200 hover:bg-rose-900/40"
        >
          Retry
        </button>
      </div>
    )
  }
}
