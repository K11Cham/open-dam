import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { reportClientError } from '../../net/errorReport'

interface State {
  failed: boolean
}

/**
 * The last line of defence: if a page throws while drawing, show a plain
 * screen with a way out instead of a blank one, and report it. A game in
 * progress is saved after every move, so reloading picks it up. Deliberately
 * plain markup: the shell or the theme may be what broke.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(
      'render',
      `${error.message}${info.componentStack ? ` (in ${info.componentStack.trim().split('\n')[0].trim()})` : ''}`,
    )
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="page page--narrow crash">
        <section className="panel" aria-labelledby="crash-h">
          <h1 id="crash-h" className="panel__title">
            Something went wrong
          </h1>
          <p className="panel__text">
            This page stopped working. Any game in progress is saved on this device, so reloading picks it up where you left off.
          </p>
          <div className="panel__actions">
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <a className="btn btn--secondary" href="/">
              Home
            </a>
          </div>
        </section>
      </main>
    )
  }
}
