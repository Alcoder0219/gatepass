import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/services/endpoints';
import { getAccessToken, setAccessToken, setUnauthorisedHandler } from '@/services/api';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  permissions: string[];
  isAuthenticated: boolean;
  /** True only while the initial session probe is in flight. */
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<User>;
  loginWithOtp: (email: string, otp: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const applySession = useCallback((nextUser: User, nextPermissions?: string[]) => {
    setUserState(nextUser);
    setPermissions(nextPermissions ?? nextUser.role?.permissions ?? []);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUserState(null);
    setPermissions([]);
    queryClient.clear();
  }, [queryClient]);

  /* Boot: if we still hold an access token (or a refresh cookie), resolve the
   * session before the router renders, so a refresh never bounces the user to
   * /login and back. */
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const me = await authApi.me();
        if (!cancelled) applySession(me, me.permissions);
      } catch {
        // No valid token AND no usable refresh cookie — stay logged out.
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // Even without an in-memory token, the httpOnly refresh cookie may still be
    // valid — the axios interceptor will silently mint a new access token.
    void bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A failed refresh means the session is unrecoverable — drop it. */
  useEffect(() => {
    setUnauthorisedHandler(() => {
      clearSession();
    });
  }, [clearSession]);

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const result = await authApi.login({ email, password, rememberMe });
      setAccessToken(result.accessToken);
      applySession(result.user, result.permissions);
      return result.user;
    },
    [applySession]
  );

  const loginWithOtp = useCallback(
    async (email: string, otp: string) => {
      const result = await authApi.verifyOtp({ email, otp });
      setAccessToken(result.accessToken);
      applySession(result.user, result.permissions);
      return result.user;
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // The server may already have dropped the session; log out locally regardless.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const me = await authApi.me();
    applySession(me, me.permissions);
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      permissions,
      isAuthenticated: Boolean(user && getAccessToken()),
      isLoading,
      login,
      loginWithOtp,
      logout,
      refreshUser,
      setUser: (next: User) => applySession(next),
    }),
    [user, permissions, isLoading, login, loginWithOtp, logout, refreshUser, applySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
};
