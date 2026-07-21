import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { C_ERROR, C_TEXT_MUTED, C_CARD_BG, C_BORDER } from '../styles/tokens'

interface ViewErrorBoundaryProps {
  children: ReactNode
  /** Called on catch so the shell can log/report; the boundary owns the fallback UI itself. */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ViewErrorBoundaryState {
  error: Error | null
}

/**
 * Contains a render crash in the center view so one bad atom cannot blank the whole workspace.
 *
 * The Flow LOD block throws if it is handed a value the contract said could not occur (e.g. a
 * non-string `content` from the backend). React unwinds to the nearest boundary; without one it
 * unmounts the entire app. This boundary keeps the shell — header, rails, search — alive and
 * offers a retry that remounts the subtree via a key bump.
 */
export class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  state: ViewErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info)
  }

  private handleRetry = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        role="alert"
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          padding: '1.5rem',
          textAlign: 'center',
          background: C_CARD_BG,
        }}
      >
        <p style={{ margin: 0, color: C_ERROR, fontWeight: 600 }}>
          This view ran into a problem and couldn&apos;t be displayed.
        </p>
        <p style={{ margin: 0, fontSize: '0.8rem', color: C_TEXT_MUTED, maxWidth: '28rem' }}>
          The rest of the workspace is still available. You can retry, or switch to another view.
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          style={{ padding: '0.4rem 1rem', cursor: 'pointer', border: `1px solid ${C_BORDER}`, borderRadius: 4, background: 'none' }}
        >
          Retry
        </button>
      </div>
    )
  }
}
