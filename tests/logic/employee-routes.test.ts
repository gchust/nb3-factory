// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context, Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  employeeRecordsToken,
  type CertificateRecord,
  type EmployeeRecord,
  type EmployeeRecordsService,
} from '../../server/providers/employee-records.js';
import { employeeRoutes } from '../../server/routes/employees.js';

const AUTH_HEADER = 'x-test-auth';

function createRouter() {
  const container = new ServiceContainer();
  const state = createFakeService();

  const auth = {
    required:
      () =>
      async (
        context: Context,
        next: () => Promise<void>,
      ): Promise<Response | void> => {
        if (context.req.header(AUTH_HEADER) !== 'yes') {
          return context.json({ code: 'UNAUTHORIZED' }, 401);
        }
        await next();
      },
  };

  const fileManager = {
    repository: () => ({
      getUrl: ({ id, ext }: { id: string; ext: string }) =>
        `/uploads/employee-records/${id}${ext ? `.${ext}` : ''}`,
    }),
  };

  container.instance(authenticationToken, auth as never);
  container.instance(employeeRecordsToken, state.service as never);
  container.instance(serverFileRepositoryManagerToken, fileManager as never);

  const app = {
    container,
    publicBasePath: '/main',
  } as unknown as Application;

  return { router: employeeRoutes.createRouter(app), state };
}

function createFakeService(): {
  service: EmployeeRecordsService;
  employees: EmployeeRecord[];
  certificates: CertificateRecord[];
} {
  const employees: EmployeeRecord[] = [
    {
      id: 1,
      name: '张伟',
      employeeNo: 'E1001',
      department: '安全环保部',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const certificates: CertificateRecord[] = [
    {
      id: 1,
      employeeId: 1,
      name: '特种作业操作证',
      expiresAt: '2027-06-30T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      attachments: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          filename: 'permit.txt',
          mimeType: 'text/plain',
          size: 12,
          ext: 'txt',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
  ];

  const service: EmployeeRecordsService = {
    async listEmployees() {
      return employees;
    },
    async getEmployee(id) {
      return employees.find((employee) => employee.id === id);
    },
    async createEmployee(input) {
      if (input.employeeNo === 'DUP') {
        throw new Error('UNIQUE constraint failed: employees.employee_no');
      }
      const employee: EmployeeRecord = {
        id: employees.length + 1,
        name: input.name,
        employeeNo: input.employeeNo,
        department: input.department,
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      };
      employees.push(employee);
      return employee;
    },
    async listCertificates(employeeId) {
      return certificates.filter(
        (certificate) => certificate.employeeId === employeeId,
      );
    },
    async createCertificate(employeeId, input) {
      if (!employees.some((employee) => employee.id === employeeId)) {
        return undefined;
      }
      const certificate: CertificateRecord = {
        id: certificates.length + 1,
        employeeId,
        name: input.name,
        expiresAt: input.expiresAt ? `${input.expiresAt}T00:00:00.000Z` : null,
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        attachments: (input.fileIds ?? []).map((id) => ({
          id,
          filename: 'attachment.txt',
          mimeType: 'text/plain',
          size: 5,
          ext: 'txt',
          createdAt: '2026-02-01T00:00:00.000Z',
        })),
      };
      certificates.push(certificate);
      return certificate;
    },
    async deleteCertificate(id) {
      const index = certificates.findIndex(
        (certificate) => certificate.id === id,
      );
      if (index === -1) return false;
      certificates.splice(index, 1);
      return true;
    },
  };

  return { service, employees, certificates };
}

describe('employee records API', () => {
  let router: Hono;

  beforeEach(async () => {
    router = await createRouter().router;
  });

  it('rejects anonymous requests with 401', async () => {
    const response = await router.request('/employees');
    expect(response.status).toBe(401);
    const certificateResponse = await router.request(
      '/employees/1/certificates',
      { method: 'POST' },
    );
    expect(certificateResponse.status).toBe(401);
  });

  it('lists employees for an authenticated caller', async () => {
    const response = await router.request('/employees', {
      headers: { [AUTH_HEADER]: 'yes' },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: EmployeeRecord[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.employeeNo).toBe('E1001');
  });

  it('creates an employee and validates input', async () => {
    const created = await router.request('/employees', {
      method: 'POST',
      headers: { [AUTH_HEADER]: 'yes', 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '李娜',
        employeeNo: 'E1002',
        department: '设备管理部',
      }),
    });
    expect(created.status).toBe(201);

    const invalid = await router.request('/employees', {
      method: 'POST',
      headers: { [AUTH_HEADER]: 'yes', 'content-type': 'application/json' },
      body: JSON.stringify({ employeeNo: 'E1003' }),
    });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { code: string }).code).toBe(
      'INVALID_INPUT',
    );
  });

  it('reports a duplicate employee number with 409', async () => {
    const response = await router.request('/employees', {
      method: 'POST',
      headers: { [AUTH_HEADER]: 'yes', 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '重复',
        employeeNo: 'DUP',
        department: '测试部',
      }),
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe(
      'EMPLOYEE_NO_TAKEN',
    );
  });

  it('returns employee detail with decorated attachment content URLs', async () => {
    const response = await router.request('/employees/1', {
      headers: { [AUTH_HEADER]: 'yes' },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { certificates: CertificateRecord[]; employee: EmployeeRecord };
    };
    const attachment = body.data.certificates[0]?.attachments[0] as unknown as {
      contentUrl: string;
    };
    expect(attachment.contentUrl).toBe(
      '/main/uploads/employee-records/11111111-1111-4111-8111-111111111111.txt',
    );
  });

  it('returns 404 for an unknown employee', async () => {
    const response = await router.request('/employees/999', {
      headers: { [AUTH_HEADER]: 'yes' },
    });
    expect(response.status).toBe(404);
  });

  it('creates a certificate with attachments', async () => {
    const response = await router.request('/employees/1/certificates', {
      method: 'POST',
      headers: { [AUTH_HEADER]: 'yes', 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '安全生产考核合格证',
        expiresAt: '2026-12-31',
        fileIds: ['22222222-2222-4222-8222-222222222222'],
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      data: CertificateRecord & { attachments: { contentUrl: string }[] };
    };
    expect(body.data.name).toBe('安全生产考核合格证');
    expect(body.data.expiresAt).toBe('2026-12-31T00:00:00.000Z');
    expect(body.data.attachments[0]?.contentUrl).toBe(
      '/main/uploads/employee-records/22222222-2222-4222-8222-222222222222.txt',
    );
  });

  it('rejects a certificate for an unknown employee', async () => {
    const response = await router.request('/employees/999/certificates', {
      method: 'POST',
      headers: { [AUTH_HEADER]: 'yes', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '无主证件' }),
    });
    expect(response.status).toBe(404);
  });

  it('rejects an invalid expiry date', async () => {
    const response = await router.request('/employees/1/certificates', {
      method: 'POST',
      headers: { [AUTH_HEADER]: 'yes', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '证件', expiresAt: '31/12/2026' }),
    });
    expect(response.status).toBe(400);
  });

  it('deletes a certificate and reports an unknown one as missing', async () => {
    const deleted = await router.request('/certificates/1', {
      method: 'DELETE',
      headers: { [AUTH_HEADER]: 'yes' },
    });
    expect(deleted.status).toBe(200);
    const missing = await router.request('/certificates/999', {
      method: 'DELETE',
      headers: { [AUTH_HEADER]: 'yes' },
    });
    expect(missing.status).toBe(404);
  });
});
