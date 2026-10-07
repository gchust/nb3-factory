/**
 * The HR endpoints, as plain functions over the application's API client.
 *
 * A plain function cannot call `useApiClient()`, so every function takes the
 * client as its first parameter; components get it from the hook. Paths are
 * relative to the API base URL, so they carry no `/api` and no base path.
 */
import type { ApiClient } from '@nocobase/app-client';

import type {
  EmployeeStatus,
  HrDashboard,
  HrData,
  HrDepartment,
  HrEmployee,
  HrLeaveRequest,
  HrList,
  HrNotification,
  LeaveStatus,
  LeaveType,
} from './types.js';

export interface DepartmentInput {
  title?: string;
  code?: string;
  parentId?: number;
  managerId?: string;
  active?: boolean;
  sortOrder?: number;
  description?: string;
}

export interface EmployeeInput {
  name?: string;
  employeeNo?: string;
  email?: string;
  phone?: string;
  departmentId?: number | null;
  position?: string;
  status?: EmployeeStatus;
  hireDate?: string;
  openAccount?: boolean;
  idNumber?: string;
  contractNo?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  notes?: string;
}

export interface LeaveInput {
  type?: LeaveType;
  startDate?: string;
  endDate?: string;
  reason?: string;
  resubmit?: boolean;
}

export async function fetchDashboard(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<HrDashboard> {
  const { data } = await api.request<HrData<HrDashboard>>({
    path: 'hr/dashboard',
    signal,
  });
  return data;
}

export async function fetchMyEmployee(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<HrEmployee> {
  const { data } = await api.request<HrData<HrEmployee>>({
    path: 'hr/me',
    signal,
  });
  return data;
}

export async function fetchDepartments(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<HrDepartment[]> {
  const { data } = await api.request<HrList<HrDepartment>>({
    path: 'hr/departments',
    signal,
  });
  return data;
}

export async function createDepartment(
  api: ApiClient,
  input: DepartmentInput,
): Promise<HrDepartment> {
  const { data } = await api.request<HrData<HrDepartment>, DepartmentInput>({
    path: 'hr/departments',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateDepartment(
  api: ApiClient,
  id: number,
  input: DepartmentInput,
): Promise<HrDepartment> {
  const { data } = await api.request<HrData<HrDepartment>, DepartmentInput>({
    path: `hr/departments/${encodeURIComponent(String(id))}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export interface EmployeeQuery {
  status?: EmployeeStatus;
  departmentId?: number;
  search?: string;
}

export async function fetchEmployees(
  api: ApiClient,
  query: EmployeeQuery,
  signal?: AbortSignal,
): Promise<HrEmployee[]> {
  const { data } = await api.request<HrList<HrEmployee>>({
    path: 'hr/employees',
    query: {
      status: query.status,
      departmentId: query.departmentId,
      search: query.search,
    },
    signal,
  });
  return data;
}

export async function fetchEmployee(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<HrEmployee> {
  const { data } = await api.request<HrData<HrEmployee>>({
    path: `hr/employees/${encodeURIComponent(String(id))}`,
    signal,
  });
  return data;
}

export async function createEmployee(
  api: ApiClient,
  input: EmployeeInput,
): Promise<HrEmployee> {
  const { data } = await api.request<HrData<HrEmployee>, EmployeeInput>({
    path: 'hr/employees',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateEmployee(
  api: ApiClient,
  id: number,
  input: EmployeeInput,
): Promise<HrEmployee> {
  const { data } = await api.request<HrData<HrEmployee>, EmployeeInput>({
    path: `hr/employees/${encodeURIComponent(String(id))}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function changeEmployeeLifecycle(
  api: ApiClient,
  id: number,
  action: 'onboard' | 'offboard',
  options: { email?: string; username?: string } = {},
): Promise<HrEmployee> {
  const { data } = await api.request<
    HrData<HrEmployee>,
    { action: string; email?: string; username?: string }
  >({
    path: `hr/employees/${encodeURIComponent(String(id))}/lifecycle`,
    method: 'POST',
    json: { action, ...options },
  });
  return data;
}

export interface LeaveQuery {
  status?: LeaveStatus;
  mine?: boolean;
}

export async function fetchLeaveRequests(
  api: ApiClient,
  query: LeaveQuery,
  signal?: AbortSignal,
): Promise<HrLeaveRequest[]> {
  const { data } = await api.request<HrList<HrLeaveRequest>>({
    path: 'hr/leave-requests',
    query: { status: query.status, mine: query.mine },
    signal,
  });
  return data;
}

export async function applyLeave(
  api: ApiClient,
  input: LeaveInput,
): Promise<HrLeaveRequest> {
  const { data } = await api.request<HrData<HrLeaveRequest>, LeaveInput>({
    path: 'hr/leave-requests',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateLeaveRequest(
  api: ApiClient,
  id: number,
  input: LeaveInput,
): Promise<HrLeaveRequest> {
  const { data } = await api.request<HrData<HrLeaveRequest>, LeaveInput>({
    path: `hr/leave-requests/${encodeURIComponent(String(id))}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function decideLeaveRequest(
  api: ApiClient,
  id: number,
  decision: 'approved' | 'rejected',
  rejectionReason?: string,
): Promise<HrLeaveRequest> {
  const { data } = await api.request<
    HrData<HrLeaveRequest>,
    { decision: string; rejectionReason?: string }
  >({
    path: `hr/leave-requests/${encodeURIComponent(String(id))}/decision`,
    method: 'POST',
    json: { decision, rejectionReason },
  });
  return data;
}

export async function fetchNotifications(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<HrNotification[]> {
  const { data } = await api.request<HrList<HrNotification>>({
    path: 'hr/notifications',
    signal,
  });
  return data;
}

export async function markNotificationRead(
  api: ApiClient,
  id: number,
): Promise<HrNotification> {
  const { data } = await api.request<HrData<HrNotification>>({
    path: `hr/notifications/${encodeURIComponent(String(id))}/read`,
    method: 'POST',
  });
  return data;
}
