/**
 * Temporary diagnostic. Ships whatever went wrong to the API so a failure we
 * cannot reproduce server-side still reaches the logs. Serializes the raw thrown
 * value carefully, because the thing React caught on the live site arrived as an
 * empty Error — so the *shape* of what's thrown is exactly what we need to see.
 */
const base = import.meta.env.VITE_API_URL ?? '/api/v1';

const describe = (value: unknown): string => {
  if (value instanceof Error) {
    return `Error[${value.name}]: ${value.message}\n${value.stack ?? ''}`;
  }
  const type = Object.prototype.toString.call(value);
  let json = '';
  try {
    json = JSON.stringify(value, Object.getOwnPropertyNames(value ?? {}));
  } catch {
    json = '(unserializable)';
  }
  return `raw=${String(value)} | typeof=${typeof value} | tag=${type} | json=${json}`;
};

export const reportError = (label: string, value: unknown, extra = '') => {
  try {
    void fetch(`${base}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        message: `${label}: ${describe(value).slice(0, 400)}`,
        stack: `${describe(value)}\n${extra}`.slice(0, 3000),
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => undefined);
  } catch {
    /* never let reporting throw */
  }
};

/** Global net: catches async failures that never reach a React error boundary —
 * rejected dynamic imports, library throws, image/script load errors. */
export const installGlobalErrorReporting = () => {
  window.addEventListener('error', (event) => {
    // Resource load errors (script/img/link) have a target but no error object.
    const target = event.target as HTMLElement | null;
    if (target && target !== (window as unknown as HTMLElement) && 'tagName' in target) {
      const src = (target as HTMLScriptElement | HTMLImageElement).src ?? '';
      reportError('RESOURCE_ERROR', `${target.tagName} failed to load: ${src}`);
      return;
    }
    reportError('WINDOW_ERROR', event.error ?? event.message, `at ${event.filename}:${event.lineno}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError('UNHANDLED_REJECTION', event.reason);
  });
};

export default reportError;