import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { reportError } from '@/utils/reportError';

interface Props {
  children: ReactNode;
  /** Changing this remounts the boundary, clearing a latched error. */
  resetKey: string;
}

interface State {
  error: Error | null;
}

const CHUNK_RELOAD_KEY = 'gatepass.chunkBoundaryReloadAt';

/** Was the recovery reload attempted in the last few seconds? Guards against loops. */
const reloadedRecently = () => {
  try {
    const at = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    return at > 0 && Date.now() - at < 10_000;
  } catch {
    return false;
  }
};

/** A dynamic-import failure — the shapes browsers use for a chunk that 404s. */
const isChunkLoadError = (error: Error, componentStack = '') => {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`;
  if (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk [\d]+ failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /error loading dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text)
  ) {
    return true;
  }

  /* The live crash arrived as an EMPTY error — no name, no message, and an empty
   * component stack. A genuine render bug carries a component stack; an empty one
   * is the signature of a module/asset that failed to load (a stale chunk after a
   * deploy, whose real reason the browser has already discarded by the time it
   * reaches here). Treat that shape as recoverable and let the reload try. */
  const hasMessage = Boolean(error?.message && error.message.trim());
  const hasComponentStack = Boolean(componentStack && componentStack.trim());
  return !hasMessage && !hasComponentStack;
};

/**
 * The root ErrorBoundary is the last line of defence for the whole app, so it
 * intentionally stays broken until reload. That is the wrong behaviour *per
 * route*: one page throwing should not leave every other page dead. This
 * boundary is keyed on the pathname, so navigating away is itself the recovery
 * — which is exactly what a user expects from clicking a different sidebar item.
 */
class RouteErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Route render error:', error, info.componentStack);

    // Temporary telemetry — robustly serialized (see reportError).
    reportError('ROUTE_BOUNDARY', error, `--- component ---${info?.componentStack ?? ''}`);

    /* A failed dynamic import (stale chunk after a deploy) reaches the boundary
     * as a render error. Recover it automatically with a cache-busting hard
     * reload — but only once in a short window, so a genuine render bug can't
     * become a reload loop. This is the belt to lazyWithRetry's braces: it also
     * catches a chunk that fails to load as a *dependency* of the page, not just
     * the page module itself. */
    if (isChunkLoadError(error, info?.componentStack ?? '') && !reloadedRecently()) {
      try {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
      } catch {
        /* private mode — proceed to reload anyway */
      }
      const url = new URL(window.location.href);
      url.searchParams.set('_r', String(Date.now()));
      window.location.replace(url.toString());
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="card w-full max-w-lg p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-500/15 text-danger-500">
            <AlertTriangle className="h-7 w-7" />
          </div>

          <h1 className="text-xl font-bold text-content">This page didn&apos;t load</h1>
          <p className="mt-2 text-sm leading-relaxed text-content-muted">
            Something went wrong while rendering this screen. You can retry it, or just pick another
            page from the sidebar — the rest of the app is still working.
          </p>

          {/* The failure reason. Kept visible so a report screenshot is actionable
           * — a bare "didn't load" tells nobody anything. */}
          <pre className="mt-5 max-h-40 overflow-auto rounded-xl bg-surface-sunken p-4 text-left font-mono text-2xs leading-relaxed text-danger-500">
            {error.name}: {error.message}
          </pre>

          <div className="mt-6 flex justify-center gap-3">
            <Button
              leftIcon={<RotateCw className="h-4 w-4" />}
              // Hard reload, not just a state reset. If this was a stale chunk
              // after a deploy, only a fresh document fetch actually fixes it —
              // clearing state would just re-render the same broken import.
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set('_r', String(Date.now()));
                window.location.replace(url.toString());
              }}
            >
              Retry this page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

/** Remounts on every pathname change, so a crash never outlives the route. */
export const RouteErrorBoundary = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundaryInner key={pathname} resetKey={pathname}>
      {children}
    </RouteErrorBoundaryInner>
  );
};

export default RouteErrorBoundary;