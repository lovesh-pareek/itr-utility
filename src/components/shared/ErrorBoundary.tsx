import React from 'react'

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleReset = () => {
    localStorage.removeItem('itr_utility_fy2526_session')
    localStorage.removeItem('itr_utility_ai_log')
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full card text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="font-display text-xl font-bold text-ink-900 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-ink-500 mb-4">
              An unexpected error occurred. Your saved session may have been affected.
            </p>
            {this.state.error && (
              <pre className="text-xs text-rose-600 bg-rose-50 rounded-lg p-3 text-left overflow-auto mb-4">
                {this.state.error.message}
              </pre>
            )}
            <button onClick={this.handleReset} className="btn-primary mx-auto">
              Clear data and start fresh
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
