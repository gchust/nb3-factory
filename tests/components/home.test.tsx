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
import type { TicketDashboard } from '../../client/pages/tickets/shared.js';

const state = vi.hoisted(() => ({
  canAssign: true,
  canCreate: true,
  request: {
    data: undefined as { data: TicketDashboard } | undefined,
    error: undefined as unknown,
    loading: false,
    reload: vi.fn(),
  },
}));

vi.mock('../../client/pages/tickets/shared.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../client/pages/tickets/shared.js')
  >()),
  useTicketsApi: () => state.request,
  useTicketPermission: (action: string) =>
    action === 'assign' ? state.canAssign : state.canCreate,
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter>{children}</MemoryRouter>
    </TestI18nProvider>
  );
}

const dashboard: TicketDashboard = {
  summary: {
    total: 8,
    active: 4,
    pending: 2,
    processing: 1,
    escalated: 1,
    resolved: 1,
    closed: 1,
    cancelled: 2,
    unassigned: 1,
    overdue: 1,
  },
  unassigned: [
    {
      id: 'ticket-vpn',
      ticketNo: 'TK-20261007-ABC123',
      title: 'VPN disconnects every few minutes',
      description: 'The VPN drops.',
      category: 'network',
      priority: 'high',
      status: 'pending',
      requesterId: 'alice',
      assigneeId: null,
      resolution: null,
      closeNote: null,
      cancelReason: null,
      statusChangedAt: '2026-10-06T08:00:00.000Z',
      lifecycleVersion: 0,
      resolvedAt: null,
      closedAt: null,
      createdAt: '2026-10-06T08:00:00.000Z',
      updatedAt: '2026-10-06T08:00:00.000Z',
    },
  ],
  overdue: [
    {
      id: 'ticket-drive',
      ticketNo: 'TK-20261007-DEF456',
      title: 'Shared drive access lost after password reset',
      description: 'Access denied.',
      category: 'account',
      priority: 'urgent',
      status: 'escalated',
      requesterId: 'evan',
      assigneeId: 'bob',
      resolution: null,
      closeNote: null,
      cancelReason: null,
      statusChangedAt: '2026-10-06T09:00:00.000Z',
      lifecycleVersion: 2,
      resolvedAt: null,
      closedAt: null,
      createdAt: '2026-10-06T09:00:00.000Z',
      updatedAt: '2026-10-06T09:00:00.000Z',
    },
  ],
  workload: [
    { id: 'bob', name: 'Bob Liu', active: 2, escalated: 1 },
    { id: 'carol', name: 'Carol Wang', active: 1, escalated: 0 },
  ],
};

describe('service desk home page', () => {
  beforeEach(() => {
    state.canAssign = true;
    state.canCreate = true;
    state.request = {
      data: { data: dashboard },
      error: undefined,
      loading: false,
      reload: vi.fn(),
    };
  });

  it('shows the desk summary, queues and engineer workload', () => {
    render(<HomePage />, { wrapper: Wrapper });

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: enUS.helpdesk.dashboard.title,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: enUS.helpdesk.dashboard.unassignedTitle,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: enUS.helpdesk.dashboard.overdueTitle,
      }),
    ).toBeVisible();
    expect(screen.getByText('Bob Liu')).toBeVisible();
    expect(screen.getByText('Carol Wang')).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: /VPN disconnects every few minutes/,
      }),
    ).toHaveAttribute('href', '/tickets/ticket-vpn');
    expect(
      screen.getByRole('link', {
        name: /Shared drive access lost after password reset/,
      }),
    ).toHaveAttribute('href', '/tickets/ticket-drive');
    expect(
      screen.getByRole('button', { name: enUS.helpdesk.newTicket }),
    ).toHaveAttribute('href', '/tickets/new');
  });

  it('hides the engineering workload from people who cannot assign', () => {
    state.canAssign = false;
    render(<HomePage />, { wrapper: Wrapper });

    expect(
      screen.queryByRole('heading', {
        name: enUS.helpdesk.dashboard.workloadTitle,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: enUS.helpdesk.dashboard.unassignedTitle,
      }),
    ).toBeVisible();
  });

  it('reports a dashboard the server could not load', () => {
    state.request = {
      data: undefined,
      error: new Error('offline'),
      loading: false,
      reload: vi.fn(),
    };
    render(<HomePage />, { wrapper: Wrapper });

    expect(screen.getByText(enUS.helpdesk.dashboard.loadFailed)).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.helpdesk.retry }),
    ).toBeVisible();
  });
});
