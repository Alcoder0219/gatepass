import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GatePassFilters } from '@/types';

const DEFAULTS: GatePassFilters = { page: 1, limit: 20, sort: '-createdAt' };

/**
 * List filters live in the URL, not in component state. That makes every
 * filtered view shareable, bookmarkable and survivable across a refresh — and
 * the browser back button behaves the way users expect.
 */
export const useGatePassFilters = (initial: Partial<GatePassFilters> = {}) => {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<GatePassFilters>(() => {
    const fromUrl = Object.fromEntries(params.entries());
    return {
      ...DEFAULTS,
      ...initial,
      ...fromUrl,
      page: Number(fromUrl.page ?? initial.page ?? DEFAULTS.page),
      limit: Number(fromUrl.limit ?? initial.limit ?? DEFAULTS.limit),
    };
    // `initial` is a fresh object each render; only its values matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, JSON.stringify(initial)]);

  /** Any filter change resets to page 1 — staying on page 7 of a new result set is a bug. */
  const setFilter = useCallback(
    (patch: Partial<GatePassFilters>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === null || value === '' || value === 'ALL') {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const setPage = useCallback((page: number) => setParams(
    (current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(page));
      return next;
    },
    { replace: true }
  ), [setParams]);

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  /** How many filters (other than paging/sorting) are active — drives the "clear" chip. */
  const activeCount = useMemo(
    () =>
      [...params.keys()].filter((key) => !['page', 'limit', 'sort'].includes(key)).length,
    [params]
  );

  return { filters, setFilter, setPage, reset, activeCount };
};

export default useGatePassFilters;
