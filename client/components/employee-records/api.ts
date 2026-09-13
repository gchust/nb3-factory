import type { ApiClient } from '@nocobase/app-client';

/**
 * The client resource name for certificate attachments. It must match the File repository registered on the server in
 * `server/routes/employee-attachments.ts`.
 */
export const EMPLOYEE_ATTACHMENT_RESOURCE = 'employeeAttachments';

export interface Employee {
  readonly id: number;
  readonly name: string;
  readonly employeeNo: string;
  readonly department: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Attachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly ext: string;
  readonly createdAt: string;
  readonly contentUrl: string;
}

export interface Certificate {
  readonly id: number;
  readonly employeeId: number;
  readonly name: string;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly Attachment[];
}

export interface EmployeeDetail {
  readonly employee: Employee;
  readonly certificates: readonly Certificate[];
}

export interface CreateEmployeeInput {
  readonly name: string;
  readonly employeeNo: string;
  readonly department: string;
}

export interface CreateCertificateInput {
  readonly name: string;
  readonly expiresAt?: string | null;
  readonly fileIds?: readonly string[];
}

export async function listEmployees(api: ApiClient): Promise<Employee[]> {
  const { data } = await api.request<{ data: Employee[] }>({
    path: 'employees',
  });
  return data;
}

export async function createEmployee(
  api: ApiClient,
  input: CreateEmployeeInput,
): Promise<Employee> {
  const { data } = await api.request<{ data: Employee }>({
    path: 'employees',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function getEmployeeDetail(
  api: ApiClient,
  employeeId: number,
): Promise<EmployeeDetail> {
  const { data } = await api.request<{ data: EmployeeDetail }>({
    path: `employees/${employeeId}`,
  });
  return data;
}

export async function createCertificate(
  api: ApiClient,
  employeeId: number,
  input: CreateCertificateInput,
): Promise<Certificate> {
  const { data } = await api.request<{ data: Certificate }>({
    path: `employees/${employeeId}/certificates`,
    method: 'POST',
    json: input,
  });
  return data;
}

export async function deleteCertificate(
  api: ApiClient,
  certificateId: number,
): Promise<void> {
  await api.request({
    path: `certificates/${certificateId}`,
    method: 'DELETE',
  });
}
