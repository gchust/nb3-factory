import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpenseReportSummary } from '../../client/pages/expenses/api.js';

const fetchExpenseReports = vi.fn();

const { translate, apiClient } = vi.hoisted(() => ({
  // A stable `t` and API client keep the fetch effect from re-running on every
  // render, so fetch counts in this test reflect real invalidations only.
  translate: (key: string): string => key,
  apiClient: {},
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: translate }),
}));

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return { ...actual, useApiClient: () => apiClient };
});

vi.mock('../../client/pages/expenses/api.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../client/pages/expenses/api.js')>();
  return {
    ...actual,
    fetchExpenseReports: (...args: readonly unknown[]) =>
      fetchExpenseReports(...args),
  };
});

const { ReportList } = await import('../../client/pages/expenses/report-list');
const { invalidateExpenseData } =
  await import('../../client/pages/expenses/refresh');

function report(id: string, number: string): ExpenseReportSummary {
  return {
    id,
    number,
    employeeId: 'user-1',
    employeeName: '员工',
    departmentId: 'dept-1',
    departmentName: '研发部',
    status: 'draft',
    totalAmount: 100,
    purpose: '客户拜访',
    itemCount: 1,
    fileCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    submittedAt: null,
    decidedAt: null,
    paidAt: null,
    decisionComment: null,
  };
}

describe('expense report list invalidation', () => {
  beforeEach(() => {
    fetchExpenseReports.mockReset();
  });

  it('refetches and shows newly saved data when a mutation happens elsewhere', async () => {
    // Reproduces the stale-list defect: the list stays mounted under the
    // `new`/`edit` overlays and the detail route, so a save elsewhere must
    // invalidate it rather than leaving the pre-save rows on screen.
    const first = report('rpt-1', 'EXP-2026-0001');
    const second = report('rpt-2', 'EXP-2026-0002');
    fetchExpenseReports
      .mockResolvedValueOnce({ data: [first], allowed: true })
      .mockResolvedValueOnce({ data: [first, second], allowed: true });

    render(
      <MemoryRouter>
        <ReportList categories={[]} scope='mine' />
      </MemoryRouter>,
    );

    expect(await screen.findByText('EXP-2026-0001')).toBeTruthy();
    expect(screen.queryByText('EXP-2026-0002')).toBeNull();
    expect(fetchExpenseReports).toHaveBeenCalledTimes(1);

    await act(async () => {
      invalidateExpenseData();
    });

    expect(await screen.findByText('EXP-2026-0002')).toBeTruthy();
    expect(fetchExpenseReports).toHaveBeenCalledTimes(2);
  });
});
