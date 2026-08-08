import { api, request, requestPaginated } from './api';
import type {
  LeaveReport,
  ReportFilters,
  ReportKey,
  DeletableRequest,
  DeletionFilters,
  DeletionSummary,
  AllocationFilters,
  AllocationPayload,
  AllocationRow,
  AllocationSummary,
  ApprovalRequest,
  ApprovalStage,
  ApplyPayload,
  QueueCounts,
  ApplyPrefill,
  BulkApplyResult,
  LeaveDashboardStats,
  LeavePreview,
  LeaveRequestRow,
  LeaveType,
  LeaveTypeFilters,
  LeaveTypePayload,
} from '@/types/leave';

/** Strips empty / sentinel values so they never reach the query string. */
const clean = (params: object = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'ALL')
  );

/**
 * Leave module endpoints. A separate file from `endpoints.ts` on purpose — the
 * gate pass API surface stays untouched as the leave module grows.
 */
export const leaveApi = {
  dashboardStats: () => request<LeaveDashboardStats>({ url: '/leave/dashboard/stats' }),
};

export const leaveTypeApi = {
  list: (params: LeaveTypeFilters = {}) =>
    requestPaginated<LeaveType>({ url: '/leave/types', params: clean(params) }),

  lookup: () => request<LeaveType[]>({ url: '/leave/types/lookup' }),

  get: (id: string) => request<LeaveType>({ url: `/leave/types/${id}` }),

  create: (payload: LeaveTypePayload) =>
    request<LeaveType>({ url: '/leave/types', method: 'POST', data: payload }),

  update: (id: string, payload: Partial<LeaveTypePayload>) =>
    request<LeaveType>({ url: `/leave/types/${id}`, method: 'PATCH', data: payload }),

  setStatus: (id: string, isActive: boolean) =>
    request<LeaveType>({ url: `/leave/types/${id}/status`, method: 'PATCH', data: { isActive } }),

  remove: (id: string) =>
    request<{ deactivated: boolean; usage?: { requests: number; balances: number } }>({
      url: `/leave/types/${id}`,
      method: 'DELETE',
    }),
};

export const leaveApplicationApi = {
  prefill: (employee?: string) =>
    request<ApplyPrefill>({ url: '/leave/requests/prefill', params: clean({ employee }) }),

  preview: (payload: Partial<ApplyPayload> & { employee?: string }) =>
    request<LeavePreview>({ url: '/leave/requests/preview', method: 'POST', data: payload }),

  apply: (payload: ApplyPayload) =>
    request<LeaveRequestRow>({ url: '/leave/requests', method: 'POST', data: payload }),

  bulkApply: (payload: Omit<ApplyPayload, never> & { employees: string[] }) =>
    request<BulkApplyResult>({ url: '/leave/requests/bulk', method: 'POST', data: payload }),

  mine: (params: { page?: number; limit?: number; status?: string } = {}) =>
    requestPaginated<LeaveRequestRow>({ url: '/leave/requests/mine', params: clean(params) }),
};

export const leaveApprovalApi = {
  queue: (params: { stage: ApprovalStage; page?: number; limit?: number; search?: string; status?: string }) =>
    requestPaginated<ApprovalRequest>({ url: '/leave/approvals', params: clean(params) }),

  counts: () => request<QueueCounts>({ url: '/leave/approvals/counts' }),

  detail: (id: string) => request<ApprovalRequest>({ url: `/leave/approvals/${id}` }),

  approve: (id: string, remarks: string) =>
    request<ApprovalRequest>({ url: `/leave/approvals/${id}/approve`, method: 'POST', data: { remarks } }),

  reject: (id: string, remarks: string) =>
    request<ApprovalRequest>({ url: `/leave/approvals/${id}/reject`, method: 'POST', data: { remarks } }),

  sendBack: (id: string, remarks: string) =>
    request<ApprovalRequest>({ url: `/leave/approvals/${id}/send-back`, method: 'POST', data: { remarks } }),
};

export const leaveReportApi = {
  catalogue: () => request<{ key: ReportKey; label: string }[]>({ url: '/leave/reports' }),

  run: (key: ReportKey, params: ReportFilters = {}) =>
    request<LeaveReport>({ url: `/leave/reports/${key}`, params: clean(params) }),

  /** Downloads the generated file — no JSON envelope to unwrap. */
  download: async (key: ReportKey, format: 'xlsx' | 'csv' | 'pdf', params: ReportFilters = {}) => {
    const response = await api.get(`/leave/reports/${key}/export`, {
      params: { ...clean(params), format },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([response.data as BlobPart]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `leave-${key.toLowerCase()}-report-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};

export const leaveDeletionApi = {
  candidates: (params: DeletionFilters = {}) =>
    requestPaginated<DeletableRequest>({ url: '/leave/deletion/requests', params: clean(params) }),

  log: (params: DeletionFilters = {}) =>
    requestPaginated<DeletableRequest>({ url: '/leave/deletion/log', params: clean(params) }),

  summary: (params: DeletionFilters = {}) =>
    request<DeletionSummary>({ url: '/leave/deletion/summary', params: clean(params) }),

  remove: (id: string, reason: string) =>
    request<DeletableRequest>({
      url: `/leave/deletion/requests/${id}`,
      method: 'POST',
      data: { reason },
    }),

  /** Streams the CSV straight to a download — no JSON envelope to unwrap. */
  exportCsv: async (params: DeletionFilters = {}) => {
    const response = await api.get('/leave/deletion/export', {
      params: clean(params),
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([response.data as BlobPart], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `leave-deletions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};

export const leaveAllocationApi = {
  list: (params: AllocationFilters = {}) =>
    requestPaginated<AllocationRow>({ url: '/leave/allocations', params: clean(params) }),

  years: () => request<{ years: string[]; current: string }>({ url: '/leave/allocations/years' }),

  create: (payload: AllocationPayload) =>
    request<AllocationSummary>({ url: '/leave/allocations', method: 'POST', data: payload }),

  update: (
    id: string,
    payload: Partial<{
      opening: number;
      accrued: number;
      carriedForward: number;
      adjusted: number;
      remarks: string;
    }>
  ) => request<unknown>({ url: `/leave/allocations/${id}`, method: 'PATCH', data: payload }),

  remove: (id: string) => request<null>({ url: `/leave/allocations/${id}`, method: 'DELETE' }),
};

export default leaveApi;
