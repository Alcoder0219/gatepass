import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  /** What is actually painted right now — `system` resolved against the OS. */
  resolved: Resolved;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const STORAGE_KEY = 'gatepass.theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

const systemTheme = (): Resolved =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'system'
  );
  const [resolved, setResolved] = useState<Resolved>(() =>
    theme === 'system' ? systemTheme() : (theme as Resolved)
  );

  useEffect(() => {
    const next = theme === 'system' ? systemTheme() : (theme as Resolved);
    setResolved(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'dark' ? '#080c16' : '#f1f5f9');

    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  /* Track the OS preference live, but only while the user is on `system`. */
  useEffect(() => {
    if (theme !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = systemTheme();
      setResolved(next);
      document.documentElement.classList.toggle('dark', next === 'dark');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggle = useCallback(
    () => setThemeState((current) => {
      const currentResolved = current === 'system' ? systemTheme() : current;
      return currentResolved === 'dark' ? 'light' : 'dark';
    }),
    []
  );

  const value = useMemo(() => ({ theme, resolved, setTheme, toggle }), [theme, resolved, setTheme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider');
  return context;
};
