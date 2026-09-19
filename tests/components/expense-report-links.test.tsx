import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpenseReportSummary } from '../../client/pages/expenses/api.js';

const fetchExpenseReports = vi.fn();

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return { ...actual, useApiClient: () => ({}) };
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

const report: ExpenseReportSummary = {
  id: 'rpt-1',
  number: 'EXP-2026-0001',
  employeeId: 'user-1',
  employeeName: '员工',
  departmentId: 'dept-1',
  departmentName: '研发部',
  status: 'submitted',
  totalAmount: 100,
  purpose: '客户拜访',
  itemCount: 1,
  fileCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  submittedAt: '2026-01-02T00:00:00.000Z',
  decidedAt: null,
  paidAt: null,
  decisionComment: null,
};

describe('expense report list row actions', () => {
  beforeEach(() => {
    fetchExpenseReports.mockReset();
    fetchExpenseReports.mockResolvedValue({ data: [report], allowed: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the row view action as a navigation link without console errors', async () => {
    // Base UI's Button logs a console error when it renders a non-<button>
    // element while its nativeButton default is intact. Navigation actions are
    // anchors, so they must not be routed through that primitive.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <MemoryRouter>
          <ReportList categories={[]} scope='mine' />
        </MemoryRouter>,
      );

      const view = await screen.findByRole('link', {
        name: 'expenses.actions.view',
      });
      expect(view).toHaveAttribute('href', '/expenses/rpt-1');
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
