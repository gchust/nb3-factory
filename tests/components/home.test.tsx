import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import type {
  TicketDashboard,
  TicketListItem,
} from '../../client/pages/tickets/types.js';

const { api, dashboard } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  dashboard: { value: undefined as unknown },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
}));

import HomePage from '../../client/pages/home/index.js';

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function Frame({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <MemoryRouter>
      <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>
    </MemoryRouter>
  );
}

function ticket(
  id: string,
  title: string,
  overrides: Partial<TicketListItem> = {},
): TicketListItem {
  return {
    id,
    ticketNo: `TKT-${id}`,
    title,
    status: 'open',
    priority: 'high',
    category: 'incident',
    requesterId: 'requester-1',
    requester: {
      id: 'requester-1',
      name: 'Ada Employee',
      email: 'ada@example.com',
    },
    assigneeId: null,
    assignee: null,
    overdue: false,
    slaDeadline: '2026-10-02T09:00:00.000Z',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

function deskDashboard(): TicketDashboard {
  const unassigned = ticket('1', 'Laptop will not start');
  return {
    viewer: { serviceDesk: true },
    counts: {
      open: 1,
      inProgress: 2,
      resolved: 1,
      closed: 0,
      active: 3,
      unassigned: 1,
      overdue: 1,
    },
    unassigned: [unassigned],
    overdue: [ticket('2', 'VPN drops every hour', { overdue: true })],
    awaitingConfirmation: [
      ticket('3', 'Mail password reset', { status: 'resolved' }),
    ],
    recent: [unassigned],
    workload: [
      {
        user: {
          id: 'engineer-1',
          name: 'Grace Engineer',
          email: 'grace@example.com',
        },
        active: 2,
        overdue: 1,
      },
    ],
  };
}

function employeeDashboard(): TicketDashboard {
  return {
    viewer: { serviceDesk: false },
    counts: {
      open: 1,
      inProgress: 0,
      resolved: 1,
      closed: 0,
      active: 1,
      unassigned: 1,
      overdue: 0,
    },
    unassigned: [ticket('1', 'Laptop will not start')],
    overdue: [],
    awaitingConfirmation: [
      ticket('3', 'Mail password reset', { status: 'resolved' }),
    ],
    recent: [
      ticket('1', 'Laptop will not start', {
        requester: {
          id: 'user-1',
          name: 'Ada Employee',
          email: 'ada@example.com',
        },
      }),
    ],
    workload: [],
  };
}

beforeEach(() => {
  api.request.mockReset();
  dashboard.value = deskDashboard();
  api.request.mockImplementation(async () => ({ data: dashboard.value }));
});

describe('home service-desk dashboard', () => {
  it('shows unassigned tickets, overdue work and engineer workload', async () => {
    render(<HomePage />, { wrapper: Frame });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: enUS.home.title,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(enUS.home.unassigned.title)).toBeInTheDocument();
    expect(screen.getAllByText('Laptop will not start').length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(enUS.home.overdue.title)).toBeInTheDocument();
    expect(screen.getByText('VPN drops every hour')).toBeInTheDocument();
    expect(screen.getByText(enUS.home.workload.title)).toBeInTheDocument();
    expect(screen.getByText('Grace Engineer')).toBeInTheDocument();
    expect(
      screen.getByText(
        enUS.home.workload.activeCount.replace('{{count}}', '2'),
      ),
    ).toBeInTheDocument();
  });

  it('gives an employee their own queue instead of the service-desk tools', async () => {
    dashboard.value = employeeDashboard();
    render(<HomePage />, { wrapper: Frame });

    expect(await screen.findByText(enUS.home.myOpen.title)).toBeInTheDocument();
    expect(screen.getByText(enUS.home.awaiting.title)).toBeInTheDocument();
    expect(
      screen.queryByText(enUS.home.workload.title),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(enUS.home.unassigned.title),
    ).not.toBeInTheDocument();
  });
});
