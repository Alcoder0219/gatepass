import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query from JS.
 *
 * Used by DataTable to render EITHER the desktop rows OR the mobile cards —
 * previously it built both and let Tailwind hide one, so every list paid for
 * twice the rows it ever showed.
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
};

/** Tailwind's `md` breakpoint. Keep in sync with the `md:` classes in Table. */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');

export default useMediaQuery;
