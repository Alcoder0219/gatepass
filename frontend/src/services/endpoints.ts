import { api, request, requestPaginated } from './api';
import type {
  ActivityItem,
  AuditLog,
  DashboardCharts,
  DashboardStats,
  Department,
  GatePass,
  GatePassFilters,
  GatePassPrefill,
  GatePassStatus,
  GlobalSearchResults,
  Holiday,
  HRReviewRecord,
  Insight,
  Notification,
  PermissionCatalogueGroup,
  Role,
  SecurityLog,
  SecurityVerification,
  Settings,
  Unit,
  User,
} from '@/types';

/**
 * Strips empty strings / undefined so they never reach the query string.
 * Takes `object` rather than `Record<string, unknown>` so typed filter
 * interfaces (which have no index signature) can be passed directly.
 */
const clean = (params: object = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'ALL')
  );

/* ─── Auth ───────────────────────────────────────────────────────────────── */
export const authApi = {
  login: (payload: { email: string; password: string; rememberMe?: boolean }) =>
    request<{ user: User; accessToken: string; permissions: string[] }>({
      url: '/auth/login',
      method: 'POST',
      data: payload,
    }),

  logout: () => request<null>({ url: '/auth/logout', method: 'POST' }),

  me: () => request<User & { permissions: string[] }>({ url: '/auth/me' }),

  forgotPassword: (email: string) =>
    request<null>({ url: '/auth/forgot-password', method: 'POST', data: { email } }),

  resetPassword: (payload: { token: string; password: string }) =>
    request<null>({ url: '/auth/reset-password', method: 'POST', data: payload }),

  sendOtp: (email: string) => request<null>({ url: '/auth/send-otp', method: 'POST', data: { email } }),

  verifyOtp: (payload: { email: string; otp: string }) =>
    request<{ user: User; accessToken: string; permissions: string[] }>({
      url: '/auth/verify-otp',
      method: 'POST',
      data: payload,
    }),

  updateProfile: (payload: Partial<User>) =>
    request<User>({ url: '/auth/me', method: 'PATCH', data: payload }),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<null>({ url: '/auth/me/password', method: 'PATCH', data: payload }),

  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('profileImage', file);
    return request<User>({
      url: '/auth/me/avatar',
      method: 'POST',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

/* ─── Gate passes ────────────────────────────────────────────────────────── */
export const gatePassApi = {
  list: (filters: GatePassFilters = {}) =>
    requestPaginated<GatePass>({ url: '/gate-passes', params: clean(filters) }),

  mine: (filters: GatePassFilters = {}) =>
    requestPaginated<GatePass>({ url: '/gate-passes/mine', params: clean(filters) }),

  pendingApproval: (filters: GatePassFilters = {}) =>
    requestPaginated<GatePass>({ url: '/gate-passes/pending-approval', params: clean(filters) }),

  stats: () =>
    request<{ total: number; byStatus: Record<GatePassStatus, number> }>({
      url: '/gate-passes/stats',
    }),

  prefill: () => request<GatePassPrefill>({ url: '/gate-passes/prefill' }),

  get: (id: string) => request<GatePass>({ url: `/gate-passes/${id}` }),

  create: (data: FormData) =>
    request<GatePass>({
      url: '/gate-passes',
      method: 'POST',
      data,
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  update: (id: string, data: FormData | Record<string, unknown>) =>
    request<GatePass>({
      url: `/gate-passes/${id}`,
      method: 'PATCH',
      data,
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
    }),

  approve: (id: string, comment = '') =>
    request<GatePass>({ url: `/gate-passes/${id}/approve`, method: 'POST', data: { comment } }),

  reject: (id: string, comment: string) =>
    request<GatePass>({ url: `/gate-passes/${id}/reject`, method: 'POST', data: { comment } }),

  requestChanges: (id: string, comment: string) =>
    request<GatePass>({ url: `/gate-passes/${id}/request-changes`, method: 'POST', data: { comment } }),

  cancel: (id: string, comment = '') =>
    request<GatePass>({ url: `/gate-passes/${id}/cancel`, method: 'POST', data: { comment } }),

  remove: (id: string) => request<null>({ url: `/gate-passes/${id}`, method: 'DELETE' }),

  qr: (id: string) => request<{ qrCode: string }>({ url: `/gate-passes/${id}/qr` }),

  print: (id: string) => request<GatePass>({ url: `/gate-passes/${id}/print` }),
};

/* ─── HR ─────────────────────────────────────────────────────────────────── */
export const hrApi = {
  queue: (filters: GatePassFilters = {}) =>
    requestPaginated<GatePass>({ url: '/hr/queue', params: clean(filters) }),

  reviews: (filters: Record<string, unknown> = {}) =>
    requestPaginated<HRReviewRecord>({ url: '/hr/reviews', params: clean(filters) }),

  stats: () => request<Record<string, number>>({ url: '/hr/stats' }),

  review: (id: string, payload: { status: 'OK' | 'NOT_OK'; comment?: string }) =>
    request<GatePass>({ url: `/hr/${id}/review`, method: 'POST', data: payload }),

  reject: (id: string, comment: string) =>
    request<GatePass>({ url: `/hr/${id}/reject`, method: 'POST', data: { comment } }),
};

/* ─── Security ───────────────────────────────────────────────────────────── */
export const securityApi = {
  queue: (filters: GatePassFilters = {}) =>
    requestPaginated<GatePass>({ url: '/security/queue', params: clean(filters) }),

  out: (filters: GatePassFilters = {}) =>
    requestPaginated<GatePass & { isOverdue?: boolean }>({ url: '/security/out', params: clean(filters) }),

  history: (filters: Record<string, unknown> = {}) =>
    requestPaginated<SecurityLog>({ url: '/security/history', params: clean(filters) }),

  stats: () => request<Record<string, number>>({ url: '/security/stats' }),

  get: (id: string) => request<GatePass>({ url: `/security/${id}` }),

  verify: (code: string) =>
    request<{ gatePass: GatePass; verification: SecurityVerification }>({
      url: '/security/verify',
      method: 'POST',
      data: { code },
    }),

  markExit: (id: string, payload: { remark?: string; method?: string; photo?: File | null }) => {
    const form = new FormData();
    if (payload.remark) form.append('remark', payload.remark);
    if (payload.method) form.append('method', payload.method);
    if (payload.photo) form.append('photo', payload.photo);
    return request<GatePass>({
      url: `/security/${id}/exit`,
      method: 'POST',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  markReturn: (id: string, payload: { remark?: string; method?: string; photo?: File | null }) => {
    const form = new FormData();
    if (payload.remark) form.append('remark', payload.remark);
    if (payload.method) form.append('method', payload.method);
    if (payload.photo) form.append('photo', payload.photo);
    return request<GatePass>({
      url: `/security/${id}/return`,
      method: 'POST',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

/* ─── Dashboard ──────────────────────────────────────────────────────────── */
export const dashboardApi = {
  stats: () => request<DashboardStats>({ url: '/dashboard/stats' }),
  charts: (days = 30) => request<DashboardCharts>({ url: '/dashboard/charts', params: { days } }),
  activity: (limit = 10) => request<ActivityItem[]>({ url: '/dashboard/activity', params: { limit } }),
  insights: () => request<Insight[]>({ url: '/dashboard/insights' }),
  calendar: (from: string, to: string) =>
    request<
      { id: string; title: string; start: string; end: string; status: string; type: string; employeeName: string }[]
    >({ url: '/dashboard/calendar', params: { from, to } }),
};

/* ─── Users ──────────────────────────────────────────────────────────────── */
export const userApi = {
  list: (filters: Record<string, unknown> = {}) =>
    requestPaginated<User>({ url: '/users', params: clean(filters) }),
  get: (id: string) => request<User>({ url: `/users/${id}` }),
  lookup: () => request<Pick<User, '_id' | 'name' | 'employeeId'>[]>({ url: '/users/lookup' }),
  managers: () => request<Pick<User, '_id' | 'name' | 'employeeId'>[]>({ url: '/users/managers' }),
  reportees: (id: string) => request<User[]>({ url: `/users/${id}/reportees` }),
  create: (data: FormData) =>
    request<User>({
      url: '/users',
      method: 'POST',
      data,
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  update: (id: string, data: FormData) =>
    request<User>({
      url: `/users/${id}`,
      method: 'PATCH',
      data,
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  setStatus: (id: string, status: User['status']) =>
    request<User>({ url: `/users/${id}/status`, method: 'PATCH', data: { status } }),
  resetPassword: (id: string, password: string) =>
    request<null>({ url: `/users/${id}/reset-password`, method: 'PATCH', data: { password } }),
  remove: (id: string) => request<null>({ url: `/users/${id}`, method: 'DELETE' }),
};

/* ─── Roles ──────────────────────────────────────────────────────────────── */
export const roleApi = {
  list: () => request<Role[]>({ url: '/roles' }),
  get: (id: string) => request<Role>({ url: `/roles/${id}` }),
  catalogue: () => request<PermissionCatalogueGroup[]>({ url: '/roles/permissions' }),
  create: (payload: Partial<Role>) => request<Role>({ url: '/roles', method: 'POST', data: payload }),
  update: (id: string, payload: Partial<Role>) =>
    request<Role>({ url: `/roles/${id}`, method: 'PATCH', data: payload }),
  remove: (id: string) => request<null>({ url: `/roles/${id}`, method: 'DELETE' }),
};

/* ─── Masters ────────────────────────────────────────────────────────────── */
export const unitApi = {
  list: (filters: Record<string, unknown> = {}) =>
    requestPaginated<Unit>({ url: '/units', params: clean(filters) }),
  lookup: () => request<Unit[]>({ url: '/units/lookup' }),
  create: (payload: Partial<Unit>) => request<Unit>({ url: '/units', method: 'POST', data: payload }),
  update: (id: string, payload: Partial<Unit>) =>
    request<Unit>({ url: `/units/${id}`, method: 'PATCH', data: payload }),
  remove: (id: string) => request<null>({ url: `/units/${id}`, method: 'DELETE' }),
};

export const departmentApi = {
  list: (filters: Record<string, unknown> = {}) =>
    requestPaginated<Department>({ url: '/departments', params: clean(filters) }),
  lookup: (unit?: string) => request<Department[]>({ url: '/departments/lookup', params: clean({ unit }) }),
  create: (payload: Partial<Department>) =>
    request<Department>({ url: '/departments', method: 'POST', data: payload }),
  update: (id: string, payload: Partial<Department>) =>
    request<Department>({ url: `/departments/${id}`, method: 'PATCH', data: payload }),
  remove: (id: string) => request<null>({ url: `/departments/${id}`, method: 'DELETE' }),
};

export const holidayApi = {
  list: (filters: Record<string, unknown> = {}) =>
    requestPaginated<Holiday>({ url: '/holidays', params: clean(filters) }),
  create: (payload: Partial<Holiday>) =>
    request<Holiday>({ url: '/holidays', method: 'POST', data: payload }),
  update: (id: string, payload: Partial<Holiday>) =>
    request<Holiday>({ url: `/holidays/${id}`, method: 'PATCH', data: payload }),
  remove: (id: string) => request<null>({ url: `/holidays/${id}`, method: 'DELETE' }),
};

/* ─── Reports ────────────────────────────────────────────────────────────── */
export const reportApi = {
  summary: (filters: GatePassFilters = {}) =>
    request<Record<string, unknown>>({ url: '/reports/summary', params: clean(filters) }),

  gatePasses: (filters: GatePassFilters = {}) =>
    requestPaginated<GatePass>({ url: '/reports/gate-passes', params: clean(filters) }),

  /** Downloads a generated file and hands the browser a save dialog. */
  export: async (format: 'xlsx' | 'csv' | 'pdf', filters: GatePassFilters = {}) => {
    const response = await api.get('/reports/export', {
      params: clean({ ...filters, format }),
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gate-passes-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};

/* ─── Notifications ──────────────────────────────────────────────────────── */
export const notificationApi = {
  list: (filters: Record<string, unknown> = {}) =>
    requestPaginated<Notification>({ url: '/notifications', params: clean(filters) }),
  unreadCount: () => request<{ count: number }>({ url: '/notifications/unread-count' }),
  markRead: (id: string) => request<Notification>({ url: `/notifications/${id}/read`, method: 'PATCH' }),
  markAllRead: () => request<null>({ url: '/notifications/read-all', method: 'PATCH' }),
  remove: (id: string) => request<null>({ url: `/notifications/${id}`, method: 'DELETE' }),
  clearRead: () => request<null>({ url: '/notifications', method: 'DELETE' }),
};

/* ─── Audit ──────────────────────────────────────────────────────────────── */
export const auditApi = {
  list: (filters: Record<string, unknown> = {}) =>
    requestPaginated<AuditLog>({ url: '/audit-logs', params: clean(filters) }),
  actions: () => request<{ value: string; label: string }[]>({ url: '/audit-logs/actions' }),
  stats: () => request<Record<string, unknown>>({ url: '/audit-logs/stats' }),
};

/* ─── Settings ───────────────────────────────────────────────────────────── */
export const settingsApi = {
  get: () => request<Settings>({ url: '/settings' }),
  public: () => request<Partial<Settings>>({ url: '/settings/public' }),
  update: (payload: Record<string, unknown>) =>
    request<Settings>({ url: '/settings', method: 'PATCH', data: payload }),
};

/* ─── Search ─────────────────────────────────────────────────────────────── */
export const searchApi = {
  global: (q: string) => request<GlobalSearchResults>({ url: '/search', params: { q } }),
};
