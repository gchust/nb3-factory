// The model for a page that loads through `useApiClient` and links with `react-router`. It replaces the template's
// welcome-page test: this application's landing page is the IT service-desk dashboard.
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';
import HomePage from '../../client/pages/home/index.js';
import type {
  Engineer,
  Ticket,
  TicketDashboard,
} from '../../client/pages/tickets/types.js';

const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module so `ApiClientError` stays the class the page checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

function ticket(overrides: Partial<Ticket>): Ticket {
  return {
    id: 1,
    title: 'Laptop will not power on',
    description: 'Does not start.',
    urgency: 'urgent',
    status: 'pending',
    reporterId: 'employee',
    reporterName: 'Employee One',
    assigneeId: null,
    assigneeName: null,
    handlingNote: null,
    solution: null,
    attachmentIds: [],
    attachments: [],
    assignedAt: null,
    resolvedAt: null,
    closedAt: null,
    returnedCount: 0,
    lastReturnReason: null,
    remindedAt: null,
    statusChangedAt: '2026-01-01T00:00:00Z',
    lifecycleVersion: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    available: [],
    canFire: [],
    history: [],
    ...overrides,
  };
}

function renderHome() {
  const router = createMemoryRouter([{ path: '/', element: <HomePage /> }], {
    initialEntries: ['/'],
  });
  render(<RouterProvider router={router} />, { wrapper: I18n });
}

describe('home page (IT service desk dashboard)', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('loads the dashboard and shows the counts, the waiting tickets and the workload', async () => {
    const pending = ticket({ id: 7, title: 'Printer is offline' });
    const overdue = ticket({
      id: 9,
      title: 'Shared drive permission denied',
      status: 'processing',
      assigneeId: 'engineer2',
      assigneeName: 'Engineer Two',
    });
    const workload: Engineer[] = [
      {
        id: 'engineer1',
        name: 'Engineer One',
        username: 'engineer1',
        processing: 2,
      },
    ];
    const dashboard: TicketDashboard = {
      counts: { pending: 1, processing: 1, resolved: 0, closed: 3 },
      pendingAssignment: [pending],
      overdue: [overdue],
      workload,
    };
    api.request.mockResolvedValue({ data: dashboard });

    renderHome();

    expect(await screen.findByText(/#7 Printer is offline/)).toBeVisible();
    expect(screen.getByText(/#9 Shared drive permission denied/)).toBeVisible();
    expect(screen.getByText('Engineer One')).toBeVisible();
    expect(screen.getByText(enUS.tickets.status.closed)).toBeVisible();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'tickets/dashboard' }),
    );
  });

  it('shows the empty state when nothing waits and nothing is overdue', async () => {
    api.request.mockResolvedValue({
      data: {
        counts: { pending: 0, processing: 0, resolved: 0, closed: 0 },
        pendingAssignment: [],
        overdue: [],
        workload: [],
      } satisfies TicketDashboard,
    });

    renderHome();

    expect(
      await screen.findByText(enUS.dashboard.pendingAssignment.empty),
    ).toBeVisible();
    expect(screen.getByText(enUS.dashboard.overdue.empty)).toBeVisible();
    expect(screen.getByText(enUS.dashboard.workload.empty)).toBeVisible();
  });

  it('reports a dashboard that fails to load', async () => {
    api.request.mockRejectedValue(new Error('network down'));

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      enUS.dashboard.error.load,
    );
  });
});

describe('dashboard copy', () => {
  it('translates the dashboard and ticket headings into Chinese', () => {
    for (const key of [
      'title',
      'description',
      'pendingAssignment',
      'overdue',
      'workload',
    ] as const) {
      expect(zhCN.dashboard[key]).toBeTruthy();
    }
    expect(zhCN.tickets.title).toBeTruthy();
    expect(zhCN.navigation.tickets).toBeTruthy();
  });
});
