import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const KEY = 'gatepass.scroll';

const readPositions = (): Record<string, number> => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
};

/**
 * BrowserRouter (as opposed to the data router) ships no scroll restoration, so
 * every navigation kept the previous page's scroll offset — land on a long
 * audit-log page, click into a detail, and you start halfway down it.
 *
 * PUSH → start at the top, because it is a new page.
 * POP (back/forward) → restore where the user actually was, because they are
 * returning to something they were already reading.
 */
export const useScrollRestoration = () => {
  const { key, pathname } = useLocation();
  const navigationType = useNavigationType();

  // Record the offset we are leaving behind, before the route swaps.
  useEffect(() => {
    const save = () => {
      const positions = readPositions();
      positions[key] = window.scrollY;
      try {
        sessionStorage.setItem(KEY, JSON.stringify(positions));
      } catch {
        // Private mode / quota — scroll memory is not worth throwing over.
      }
    };

    window.addEventListener('pagehide', save);
    return () => {
      save();
      window.removeEventListener('pagehide', save);
    };
  }, [key]);

  useEffect(() => {
    if (navigationType === 'POP') {
      const saved = readPositions()[key];
      if (typeof saved === 'number') {
        // After paint, or the restored page has no height to scroll into yet.
        requestAnimationFrame(() => window.scrollTo(0, saved));
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [key, pathname, navigationType]);
};

export default useScrollRestoration;
