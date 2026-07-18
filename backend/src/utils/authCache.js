/**
 * Short-TTL cache for the authenticated user's hydrated document.
 *
 * WHY: `authenticate` runs on every protected request and hydrates the caller
 * with role + department + unit + reportingManager populated — five DB round
 * trips against a remote (Atlas) cluster, on *every* API call. That fixed tax is
 * the dominant per-request cost under concurrency. Caching the resolved document
 * for a few seconds collapses those five round trips to zero on the hot path.
 *
 * SAFETY:
 *  - The cached document is treated as READ-ONLY. The only handlers that mutate
 *    `req.user` (profile edit / avatar) re-fetch a fresh document and call
 *    `invalidate()` — they never touch the shared instance.
 *  - Any write that changes a user's role, status, permissions or password
 *    invalidates that user (or clears the cache for role-wide changes), so a
 *    revoked user / permission stops working within the TTL at the latest and
 *    immediately on the path that made the change.
 *  - Access tokens already live 15 minutes; a few seconds of authorisation
 *    staleness is well inside that envelope and standard practice.
 */

const TTL_MS = Number.parseInt(process.env.AUTH_CACHE_TTL_MS ?? '15000', 10) || 15000;
const MAX_ENTRIES = 5000; // safety ceiling so the map cannot grow without bound

const store = new Map(); // userId -> { doc, expires }

export const getCachedUser = (id) => {
  const key = String(id);
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.doc;
};

export const setCachedUser = (id, doc) => {
  if (store.size >= MAX_ENTRIES) store.clear(); // cheap bound; cold start re-warms in seconds
  store.set(String(id), { doc, expires: Date.now() + TTL_MS });
};

/** Drop one user — call after any write to that user's authz-relevant fields. */
export const invalidateUser = (id) => {
  if (id) store.delete(String(id));
};

/** Drop everything — call when a change affects many users at once (e.g. a role). */
export const clearAuthCache = () => store.clear();

export default { getCachedUser, setCachedUser, invalidateUser, clearAuthCache };
