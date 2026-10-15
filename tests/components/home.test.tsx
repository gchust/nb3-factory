// The service desk home page: the numbers the desk watches, each engineer's open workload and the two ticket lists.
// The page loads through `useApiClient`, so the client is mocked and the real `ApiClientError` is kept, exactly as
// `page-harness.test.tsx` does for a page of its own.
import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import HomePage from '../../client/pages/home/index.js';
import type { ServiceDeskDashboard } from '../../client/pages/tickets/types.js';

// `vi.mock` factories run before this file's imports, so the mock object is created here.
const { api } = vi.hoisted(() => ({
  // One object for the whole file: a new one per call would restart the page's load effect.
  api: { request: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the page checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
}));

// The real runtime, strict: a key the resources lack fails the test instead of rendering as text.
const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

const dashboard: ServiceDeskDashboard = {
  pendingAssignment: 2,
  processing: 3,
  resolved: 1,
  overdue: 4,
  pendingTickets: [
    {
      id: 11,
      title: 'Laptop will not power on',
      status: 'pending',
      urgency: 'high',
      createdAt: '2026-01-05T09:00:00.000Z',
    } as ServiceDeskDashboard['pendingTickets'][number],
  ],
  overdueTickets: [
    {
      id: 12,
      title: 'VPN drops every hour',
      status: 'processing',
      urgency: 'urgent',
      createdAt: '2026-01-04T09:00:00.000Z',
    } as ServiceDeskDashboard['overdueTickets'][number],
  ],
  workload: [{ assigneeId: 'u1', assigneeName: 'Morgan Reed', openCount: 3 }],
};

function renderHome() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <HomePage />,
        children: [{ path: ':ticketId', element: <div /> }],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />, { wrapper: I18n });
}

describe('service desk home page', () => {
  beforeEach(() => {
    api.request.mockReset();
  });

  it('shows the metric cards, workload and both ticket lists', async () => {
    api.request.mockResolvedValue({ data: dashboard });

    renderHome();

    await waitFor(() =>
      expect(screen.getByText(enUS.dashboard.metric.resolved)).toBeVisible(),
    );

    const metrics: readonly (readonly [string, number])[] = [
      [enUS.dashboard.metric.pendingAssignment, dashboard.pendingAssignment],
      [enUS.dashboard.metric.processing, dashboard.processing],
      [enUS.dashboard.metric.resolved, dashboard.resolved],
      [enUS.dashboard.metric.overdue, dashboard.overdue],
    ];
    // The metric cards are the small cards; badge text elsewhere shares a label with one of them.
    const metricCards = Array.from(
      document.querySelectorAll('[data-slot="card"][data-size="sm"]'),
    );
    expect(metricCards).toHaveLength(metrics.length);
    metrics.forEach(([label, value], index) => {
      expect(within(metricCards[index]).getByText(label)).toBeVisible();
      expect(within(metricCards[index]).getByText(String(value))).toBeVisible();
    });

    expect(screen.getByText('Morgan Reed')).toBeVisible();
    expect(screen.getByText('Laptop will not power on')).toBeVisible();
    expect(screen.getByText('VPN drops every hour')).toBeVisible();
  });

  it('opens a ticket over the home page through a child route link', async () => {
    api.request.mockResolvedValue({ data: dashboard });

    renderHome();

    const link = await screen.findByRole('link', {
      name: /Laptop will not power on/,
    });
    expect(link).toHaveAttribute('href', '/11');
  });

  it('shows a loading state before the dashboard arrives', () => {
    api.request.mockImplementation(() => new Promise(() => {}));

    renderHome();

    expect(
      screen.getByRole('status', { name: enUS.dashboard.loading }),
    ).toBeInTheDocument();
  });

  it('tells a forbidden reader why, with no retry action', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('forbidden', {
        status: 403,
        method: 'GET',
        url: '/tickets/dashboard',
      }),
    );

    renderHome();

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(enUS.dashboard.error.forbidden),
    ).toBeVisible();
    expect(within(alert).queryByRole('button')).toBeNull();
  });

  it('offers a retry for a failure that is not a permission denial', async () => {
    api.request.mockRejectedValue(new Error('network down'));

    renderHome();

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(enUS.dashboard.error.description),
    ).toBeVisible();
    expect(
      within(alert).getByRole('button', { name: enUS.actions.retry }),
    ).toBeVisible();
  });
});
