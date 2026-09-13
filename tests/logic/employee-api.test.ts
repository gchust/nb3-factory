import type { ApiClient } from '@nocobase/app-client';
import { describe, expect, it } from 'vitest';

import {
  createCertificate,
  createEmployee,
  deleteCertificate,
  getEmployeeDetail,
  listEmployees,
} from '@/components/employee-records/api';

interface Call {
  readonly path: string;
  readonly method?: string;
  readonly json?: unknown;
}

function createFakeApi(response: unknown): { api: ApiClient; calls: Call[] } {
  const calls: Call[] = [];
  const api = {
    request: async (options: Call) => {
      calls.push(options);
      return { data: response };
    },
  } as unknown as ApiClient;
  return { api, calls };
}

describe('employee records API client', () => {
  it('lists employees and returns the payload', async () => {
    const employee = { id: 1, name: '张伟' };
    const { api, calls } = createFakeApi([employee]);

    await expect(listEmployees(api)).resolves.toEqual([employee]);
    expect(calls).toEqual([{ path: 'employees' }]);
  });

  it('creates an employee with a JSON body', async () => {
    const { api, calls } = createFakeApi({ id: 2 });

    await createEmployee(api, {
      name: '李娜',
      employeeNo: 'E1002',
      department: '设备管理部',
    });

    expect(calls).toEqual([
      {
        path: 'employees',
        method: 'POST',
        json: {
          name: '李娜',
          employeeNo: 'E1002',
          department: '设备管理部',
        },
      },
    ]);
  });

  it('loads an employee detail', async () => {
    const { api, calls } = createFakeApi({
      employee: { id: 5 },
      certificates: [],
    });

    await getEmployeeDetail(api, 5);
    expect(calls).toEqual([{ path: 'employees/5' }]);
  });

  it('creates a certificate under an employee', async () => {
    const { api, calls } = createFakeApi({ id: 7 });

    await createCertificate(api, 5, {
      name: '特种作业操作证',
      expiresAt: '2027-06-30',
      fileIds: ['file-1'],
    });

    expect(calls).toEqual([
      {
        path: 'employees/5/certificates',
        method: 'POST',
        json: {
          name: '特种作业操作证',
          expiresAt: '2027-06-30',
          fileIds: ['file-1'],
        },
      },
    ]);
  });

  it('deletes a certificate', async () => {
    const { api, calls } = createFakeApi({ id: 7 });
    await deleteCertificate(api, 9);
    expect(calls).toEqual([{ path: 'certificates/9', method: 'DELETE' }]);
  });
});
