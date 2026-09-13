import {
  apiClientToken,
  resolveAppUrl,
  useService,
} from '@nocobase/app-client';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface HrMe {
  userId: string;
  name: string;
  roles: { admin: boolean; hr: boolean; manager: boolean; employee: boolean };
  canApprove: boolean;
  canManage: boolean;
  employee: {
    id: number;
    name: string;
    employeeNo: string;
    departmentId: number | null;
    annualLeaveDays: number;
  } | null;
}

export interface HrDepartment {
  id: number;
  name: string;
  managerId: number | null;
  managerName: string | null;
}

export interface HrEmployee {
  id: number;
  name: string;
  employeeNo: string;
  departmentId: number | null;
  position: string | null;
  hireDate: string | null;
  status: string;
  annualLeaveDays: number;
  userId: string | null;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface HrLeaveRequest {
  id: number;
  employeeId: number;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  attachmentId: string | null;
  attachmentName: string | null;
  status: LeaveStatus;
  approverName: string | null;
  approvalComment: string | null;
  createdAt: string;
}

export interface HrOvertimeRequest {
  id: number;
  employeeId: number;
  overtimeDate: string;
  hours: number | string;
  reason: string | null;
  status: LeaveStatus;
  approverName: string | null;
  approvalComment: string | null;
  createdAt: string;
}

export interface HrStatistics {
  month: string;
  departments: readonly {
    departmentId: number | null;
    departmentName: string;
    leaveDays: number;
    overtimeHours: number;
  }[];
  employees: readonly {
    employeeId: number;
    employeeName: string;
    employeeNo: string;
    departmentName: string;
    annualLeaveDays: number;
    usedAnnualLeaveDays: number;
    remainingAnnualLeaveDays: number;
  }[];
  overtimeHoursThisMonth: number;
}

export interface HrAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentUrl: string;
}

interface Envelope<T> {
  data: T;
}

export class HrApiError extends Error {
  public readonly code: string | undefined;
  public readonly status: number | undefined;
  public readonly details: Record<string, unknown>;

  public constructor(
    message: string,
    code?: string,
    status?: number,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'HrApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function toHrApiError(error: unknown): HrApiError {
  if (error instanceof HrApiError) return error;
  const candidate = error as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
    payload?: unknown;
  };
  const message =
    typeof candidate?.message === 'string' ? candidate.message : String(error);
  const code = typeof candidate?.code === 'string' ? candidate.code : undefined;
  const status =
    typeof candidate?.status === 'number' ? candidate.status : undefined;
  const payload = candidate?.payload;
  const details =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  return new HrApiError(message, code, status, details);
}

export interface HrApi {
  getMe(): Promise<HrMe>;
  listDepartments(): Promise<HrDepartment[]>;
  createDepartment(input: {
    name: string;
    managerId?: number | null;
  }): Promise<HrDepartment>;
  updateDepartment(
    id: number,
    input: { name?: string; managerId?: number | null },
  ): Promise<HrDepartment>;
  listEmployees(filter?: { departmentId?: number }): Promise<HrEmployee[]>;
  createEmployee(input: Record<string, unknown>): Promise<HrEmployee>;
  updateEmployee(
    id: number,
    input: Record<string, unknown>,
  ): Promise<HrEmployee>;
  listLeaveRequests(filter?: {
    status?: string;
    employeeId?: number;
  }): Promise<HrLeaveRequest[]>;
  createLeaveRequest(input: Record<string, unknown>): Promise<HrLeaveRequest>;
  updateLeaveRequest(
    id: number,
    input: Record<string, unknown>,
  ): Promise<HrLeaveRequest>;
  decideLeaveRequest(
    id: number,
    input: { status: string; comment?: string },
  ): Promise<HrLeaveRequest>;
  listOvertimeRequests(filter?: {
    status?: string;
    employeeId?: number;
  }): Promise<HrOvertimeRequest[]>;
  createOvertimeRequest(
    input: Record<string, unknown>,
  ): Promise<HrOvertimeRequest>;
  decideOvertimeRequest(
    id: number,
    input: { status: string; comment?: string },
  ): Promise<HrOvertimeRequest>;
  getStatistics(): Promise<HrStatistics>;
  uploadAttachment(file: File): Promise<HrAttachment>;
  attachmentUrl(id: string): string;
}

export function useHrApi(): HrApi {
  const api = useService(apiClientToken);
  return useMemo<HrApi>(
    () => ({
      async getMe() {
        const response = await api.request<Envelope<HrMe>>({ path: 'hr/me' });
        return response.data;
      },
      async listDepartments() {
        const response = await api.request<Envelope<HrDepartment[]>>({
          path: 'hr/departments',
        });
        return response.data;
      },
      async createDepartment(input) {
        const response = await api.request<Envelope<HrDepartment>>({
          path: 'hr/departments',
          method: 'POST',
          json: input,
        });
        return response.data;
      },
      async updateDepartment(id, input) {
        const response = await api.request<Envelope<HrDepartment>>({
          path: `hr/departments/${id}`,
          method: 'PATCH',
          json: input,
        });
        return response.data;
      },
      async listEmployees(filter) {
        const response = await api.request<Envelope<HrEmployee[]>>({
          path: 'hr/employees',
          query: { departmentId: filter?.departmentId },
        });
        return response.data;
      },
      async createEmployee(input) {
        const response = await api.request<Envelope<HrEmployee>>({
          path: 'hr/employees',
          method: 'POST',
          json: input,
        });
        return response.data;
      },
      async updateEmployee(id, input) {
        const response = await api.request<Envelope<HrEmployee>>({
          path: `hr/employees/${id}`,
          method: 'PATCH',
          json: input,
        });
        return response.data;
      },
      async listLeaveRequests(filter) {
        const response = await api.request<Envelope<HrLeaveRequest[]>>({
          path: 'hr/leave-requests',
          query: { status: filter?.status, employeeId: filter?.employeeId },
        });
        return response.data;
      },
      async createLeaveRequest(input) {
        const response = await api.request<Envelope<HrLeaveRequest>>({
          path: 'hr/leave-requests',
          method: 'POST',
          json: input,
        });
        return response.data;
      },
      async updateLeaveRequest(id, input) {
        const response = await api.request<Envelope<HrLeaveRequest>>({
          path: `hr/leave-requests/${id}`,
          method: 'PATCH',
          json: input,
        });
        return response.data;
      },
      async decideLeaveRequest(id, input) {
        const response = await api.request<Envelope<HrLeaveRequest>>({
          path: `hr/leave-requests/${id}/decision`,
          method: 'POST',
          json: input,
        });
        return response.data;
      },
      async listOvertimeRequests(filter) {
        const response = await api.request<Envelope<HrOvertimeRequest[]>>({
          path: 'hr/overtime-requests',
          query: { status: filter?.status, employeeId: filter?.employeeId },
        });
        return response.data;
      },
      async createOvertimeRequest(input) {
        const response = await api.request<Envelope<HrOvertimeRequest>>({
          path: 'hr/overtime-requests',
          method: 'POST',
          json: input,
        });
        return response.data;
      },
      async decideOvertimeRequest(id, input) {
        const response = await api.request<Envelope<HrOvertimeRequest>>({
          path: `hr/overtime-requests/${id}/decision`,
          method: 'POST',
          json: input,
        });
        return response.data;
      },
      async getStatistics() {
        const response = await api.request<Envelope<HrStatistics>>({
          path: 'hr/statistics',
        });
        return response.data;
      },
      async uploadAttachment(file) {
        const form = new FormData();
        form.append('file', file);
        const response = await api.request<Envelope<HrAttachment>>({
          path: 'hr/attachments',
          method: 'POST',
          body: form,
        });
        return response.data;
      },
      attachmentUrl(id) {
        return resolveAppUrl(`/api/hr/attachments/${id}`);
      },
    }),
    [api],
  );
}

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: HrApiError | null;
  reload: () => void;
}

/** Loads data once on mount and exposes a manual reload. */
export function useHrQuery<T>(
  loader: () => Promise<T>,
  key = '',
): AsyncState<T> {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: HrApiError | null;
  }>({ data: null, loading: true, error: null });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    setVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const run = async (): Promise<void> => {
      try {
        const data = await loader();
        if (active) setState({ data, loading: false, error: null });
      } catch (error) {
        if (active) {
          setState({ data: null, loading: false, error: toHrApiError(error) });
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
    // The loader is intentionally not a dependency: callers change `key` when
    // the query inputs change, and `reload` triggers a manual refresh.
    // eslint-disable-next-line @eslint-react/exhaustive-deps, react-hooks/exhaustive-deps
  }, [version, key]);

  return { ...state, reload };
}
