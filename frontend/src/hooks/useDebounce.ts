import { useCallback, useEffect, useRef, useState } from 'react';

/** Returns `value` only after it has stopped changing for `delay` ms. */
export const useDebounce = <T>(value: T, delay = 300): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};

/** Debounces a callback, keeping the latest arguments. */
export const useDebouncedCallback = <A extends unknown[]>(
  callback: (...args: A) => void,
  delay = 300
) => {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(callback);

  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  useEffect(() => () => clearTimeout(timer.current), []);

  /* Stable identity, deliberately.
   *
   * This used to return a bare arrow, so the debounced function was a NEW value
   * on every render. Anything that took it as a prop re-rendered, and anything
   * that listed it in a dep array re-ran — which is how a "debounced" search
   * still managed to churn. `latest` already tracks the newest callback, so
   * there is nothing here that needs to change identity. */
  return useCallback(
    (...args: A) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(...args), delay);
    },
    [delay]
  );
};

export default useDebounce;
