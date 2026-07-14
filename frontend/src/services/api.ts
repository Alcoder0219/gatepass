import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiErrorShape, ApiResponse, PaginationMeta } from '@/types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';
const ACCESS_TOKEN_KEY = 'gatepass.accessToken';

/* ─── Access token lives in memory + sessionStorage, never in a cookie the JS
 * can't rotate. The REFRESH token is an httpOnly cookie the API sets — it is
 * never readable here, which is the point. ─────────────────────────────────── */
let accessToken: string | null = sessionStorage.getItem(ACCESS_TOKEN_KEY);

export const setAccessToken = (token: string | null) => {
  accessToken = token;
  if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
};

export const getAccessToken = () => accessToken;

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 30_000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/* ─── Silent refresh ──────────────────────────────────────────────────────
 * On a 401 with code TOKEN_EXPIRED we refresh ONCE and replay the request.
 * Concurrent 401s share a single in-flight refresh promise, so a dashboard
 * firing six queries at once does not trigger six refreshes (and six token
 * rotations, which would invalidate each other).
 * ────────────────────────────────────────────────────────────────────────── */
let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = async (): Promise<string> => {
  const { data } = await axios.post<ApiResponse<{ accessToken: string }>>(
    `${BASE_URL}/auth/refresh`,
    {},
    { withCredentials: true }
  );
  const token = data.data.accessToken;
  setAccessToken(token);
  return token;
};

/** Set by AuthContext so the interceptor can hard-log-out on an unrecoverable 401. */
let onUnauthorised: (() => void) | null = null;
export const setUnauthorisedHandler = (handler: () => void) => {
  onUnauthorised = handler;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorShape>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const status = error.response?.status;
    const isAuthRoute = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
        const token = await refreshPromise;
        original.headers.Authorization = `Bearer ${token}`;
        return await api(original);
      } catch {
        setAccessToken(null);
        onUnauthorised?.();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

/* ─── Typed helpers ──────────────────────────────────────────────────────── */

/** Unwraps `{ success, data }` → `data`. */
export const request = async <T>(config: AxiosRequestConfig): Promise<T> => {
  const { data } = await api.request<ApiResponse<T>>(config);
  return data.data;
};

/** Unwraps a paginated envelope → `{ items, meta }`. */
export const requestPaginated = async <T>(
  config: AxiosRequestConfig
): Promise<{ items: T[]; meta: PaginationMeta }> => {
  const { data } = await api.request<ApiResponse<T[]>>(config);
  return {
    items: data.data ?? [],
    meta: data.meta ?? {
      page: 1,
      limit: 20,
      total: data.data?.length ?? 0,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
};

/** Pulls the human-readable message out of any axios failure. */
export const errorMessage = (error: unknown, fallback = 'Something went wrong'): string => {
  if (axios.isAxiosError<ApiErrorShape>(error)) {
    const data = error.response?.data;
    if (data?.errors?.length) return data.errors.map((e) => e.message).join(', ');
    if (data?.message) return data.message;
    if (error.code === 'ERR_NETWORK') return 'Cannot reach the server. Is the API running?';
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

/** Field-level errors, for feeding straight into react-hook-form's setError. */
export const fieldErrors = (error: unknown): Record<string, string> => {
  if (!axios.isAxiosError<ApiErrorShape>(error)) return {};
  return (error.response?.data?.errors ?? []).reduce<Record<string, string>>((acc, item) => {
    acc[item.field] = item.message;
    return acc;
  }, {});
};

export default api;
