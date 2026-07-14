import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui';

interface State {
  error: Error | null;
}

/**
 * Last line of defence. A render crash anywhere below this shows a recoverable
 * screen instead of a white page — and in dev, the actual stack.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production this is where a Sentry / Datadog hook belongs.
    // eslint-disable-next-line no-console
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="card w-full max-w-lg p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-500/15 text-danger-500">
            <AlertTriangle className="h-7 w-7" />
          </div>

          <h1 className="text-xl font-bold text-content">Something broke</h1>
          <p className="mt-2 text-sm leading-relaxed text-content-muted">
            An unexpected error stopped this page from rendering. Reloading usually fixes it — if it
            keeps happening, send this message to your administrator.
          </p>

          {import.meta.env.DEV && (
            <pre className="mt-5 max-h-48 overflow-auto rounded-xl bg-surface-sunken p-4 text-left font-mono text-xs text-danger-500">
              {error.message}
              {'\n'}
              {error.stack}
            </pre>
          )}

          <div className="mt-6 flex justify-center gap-3">
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button leftIcon={<RotateCw className="h-4 w-4" />} onClick={() => window.location.reload()}>
              Reload the app
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
