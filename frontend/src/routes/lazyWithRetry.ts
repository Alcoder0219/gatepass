import { lazy, type ComponentType } from 'react';

/**
 * A dynamic import can fail for a reason that has nothing to do with the code:
 * we redeploy, the hashed chunk the running tab remembers 404s, and the import
 * rejects. React then surfaces that as a render crash — a dead page until the
 * user reloads by hand. This is the "This page didn't load" a user hits after a
 * deploy while their tab still holds the previous build's shell.
 *
 * Strategy: retry once for a transient blip, and if the chunk is genuinely gone,
 * reload the document once to pick up the new manifest.
 *
 * The guard is TIME-BOXED, not a permanent boolean. A plain "already reloaded"
 * flag has a nasty failure mode: if the reload lands and the import still fails
 * just once (a stale shell served in that instant, a network hiccup), the flag
 * stays set and every later navigation throws immediately with no further
 * recovery — a transient stale-bundle becomes a stuck dead page for the whole
 * session. By only suppressing a *recent* reload, an old marker no longer blocks
 * a fresh recovery attempt, so the page heals itself instead of staying broken.
 */
const RELOAD_KEY = 'gatepass.chunkReloadedAt';
const RELOAD_SUPPRESS_MS = 10_000;

const reloadedRecently = () => {
  const at = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  return at > 0 && Date.now() - at < RELOAD_SUPPRESS_MS;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lazyWithRetry = <T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) =>
  lazy(async () => {
    try {
      const module = await factory();
      sessionStorage.removeItem(RELOAD_KEY);
      return module;
    } catch (error) {
      try {
        const module = await factory();
        sessionStorage.removeItem(RELOAD_KEY);
        return module;
      } catch {
        // Don't reload again if we just did — that would be a loop. But a marker
        // from more than a few seconds ago is stale and must not block recovery.
        if (!reloadedRecently()) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
          // Never resolves; the reload wins the race.
          return new Promise<{ default: T }>(() => {});
        }
        throw error;
      }
    }
  });

export default lazyWithRetry;
