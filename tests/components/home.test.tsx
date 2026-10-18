import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import HomePage from '../../client/pages/home/index.js';
import type { DashboardResult } from '../../client/pages/tickets/types.js';

const { api } = vi.hoisted(() => ({
  api: { request: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function Providers({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter>{children}</MemoryRouter>
    </TestI18nProvider>
  );
}

const dashboard: DashboardResult = {
  canCreate: true,
  canAssign: true,
  total: 12,
  open: 3,
  assigned: 2,
  unassigned: 4,
  resolved: 5,
  closed: 2,
  overdue: 1,
  resolutionRate: 58.3,
  byPriority: { low: 2, normal: 5, high: 3, urgent: 2 },
  workload: [
    {
      id: 'user-2',
      name: 'Grace Hopper',
      email: 'grace@example.com',
      active: 3,
      overdue: 1,
    },
  ],
  recent: [
    {
      id: 8,
      title: 'Laptop will not start',
      description: 'The power light blinks.',
      status: 'assigned',
      priority: 'high',
      requesterId: 'user-1',
      requesterName: 'Ada Lovelace',
      assigneeId: 'user-2',
      assigneeName: 'Grace Hopper',
      slaDueAt: '2026-01-02T10:00:00.000Z',
      assignedAt: '2026-01-01T10:00:00.000Z',
      resolvedAt: null,
      closedAt: null,
      reopenedAt: null,
      resolution: null,
      attachments: [],
      commentCount: 1,
      overdue: false,
      createdAt: '2026-01-01T09:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
  ],
};

describe('service desk dashboard', () => {
  beforeEach(() => {
    api.request.mockReset();
  });

  it('shows workload, resolution rate, and recent tickets', async () => {
    api.request.mockResolvedValue({ data: dashboard });
    render(<HomePage />, { wrapper: Providers });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: enUS.serviceDesk.dashboard.title,
      }),
    ).toBeVisible();
    expect(await screen.findByText('Laptop will not start')).toBeVisible();
    expect(screen.getByText('58%')).toBeVisible();
    expect(
      screen.getByText(enUS.serviceDesk.dashboard.unassigned),
    ).toBeVisible();
    expect(screen.getByText('3 active')).toBeVisible();
    expect(screen.getByText('1 overdue')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Laptop will not start/ }),
    ).toHaveAttribute('href', '/tickets/8');
    expect(
      screen.getByRole('link', {
        name: enUS.serviceDesk.ticket.new,
      }),
    ).toHaveAttribute('href', '/tickets/new');
  });

  it('hides team-wide figures from someone who may not assign', async () => {
    api.request.mockResolvedValue({
      data: {
        ...dashboard,
        canAssign: false,
        unassigned: 0,
        workload: [],
      },
    });
    render(<HomePage />, { wrapper: Providers });

    expect(await screen.findByText('Laptop will not start')).toBeVisible();
    expect(
      screen.queryByText(enUS.serviceDesk.dashboard.unassigned),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(enUS.serviceDesk.dashboard.workload),
    ).not.toBeInTheDocument();
  });

  it('explains a permission denial instead of showing an empty dashboard', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Forbidden', {
        status: 403,
        method: 'GET',
        url: '/api/service-desk/dashboard',
      }),
    );
    render(<HomePage />, { wrapper: Providers });

    expect(
      await screen.findByText(enUS.serviceDesk.dashboard.deniedTitle),
    ).toBeVisible();
    expect(screen.queryByText('58%')).not.toBeInTheDocument();
  });
});
