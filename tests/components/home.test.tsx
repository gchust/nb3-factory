import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import HomePage from '../../client/pages/home/index.js';
import type { ItDashboard, Ticket } from '../../client/pages/tickets/types.js';

// One object for the whole file: a new one per call would restart the page's load effect.
const { api, refresh } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  refresh: vi.fn(),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the page checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh }),
}));

// Strict: a key the locale lacks fails the test instead of rendering as text.
const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <MemoryRouter>
      <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>
    </MemoryRouter>
  );
}

function ticket(
  overrides: Partial<Ticket> & Pick<Ticket, 'id' | 'title'>,
): Ticket {
  return {
    description: '',
    urgency: 'normal',
    status: 'pending',
    statusChangedAt: '2026-10-01T00:00:00.000Z',
    reporterId: 'u1',
    reporterName: 'Reporter',
    assigneeId: null,
    assigneeName: null,
    resolution: null,
    resolvedAt: null,
    closedAt: null,
    closedById: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    overdue: false,
    attachments: [],
    ...overrides,
  };
}

const dashboard: ItDashboard = {
  role: {
    userId: 'u1',
    role: 'serviceDesk',
    isRoot: false,
    isServiceDesk: true,
  },
  pending: 7,
  processing: 8,
  resolved: 9,
  closed: 5,
  overdue: 3,
  mine: 4,
  engineers: [
    { userId: 'e1', name: 'Alice Chen', role: 'engineer', open: 6, total: 12 },
    { userId: 'e2', name: 'Bob Li', role: null, open: 0, total: 1 },
  ],
};

const openTickets: readonly Ticket[] = [
  ticket({ id: 101, title: 'Printer is broken', overdue: true }),
  ticket({ id: 102, title: 'VPN drops', status: 'processing' }),
  ticket({ id: 103, title: 'Screen flickers' }),
];

const ticketList = {
  data: openTickets,
  meta: { total: openTickets.length, page: 1, pageSize: 100 },
};

beforeEach(() => {
  api.request.mockReset();
  refresh.mockReset();
  api.request.mockImplementation(
    async ({ path }: { readonly path: string }) => {
      if (path === 'itDashboard') return { data: dashboard };
      if (path === 'itTickets') return ticketList;
      throw new Error(`Unexpected path: ${path}`);
    },
  );
});

describe('dashboard home page', () => {
  it('shows the pending, overdue and workload views on the landing page', async () => {
    render(<HomePage />, { wrapper: I18n });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: enUS.dashboard.title,
      }),
    ).toBeInTheDocument();

    // One card per metric the service desk tracks.
    for (const value of [
      dashboard.pending,
      dashboard.processing,
      dashboard.resolved,
      dashboard.overdue,
      dashboard.mine,
      dashboard.closed,
    ]) {
      expect(screen.getByText(String(value))).toBeInTheDocument();
    }

    // Only pending tickets appear in the queue; the processing one does not. The pending ticket that is also over a
    // day old shows in both the pending and the overdue list.
    expect(screen.getAllByText('Printer is broken')).toHaveLength(2);
    expect(screen.getByText('Screen flickers')).toBeInTheDocument();
    expect(screen.queryByText('VPN drops')).not.toBeInTheDocument();

    // The overdue list repeats only the ticket that has waited more than a day.
    expect(screen.getAllByText('#101')).toHaveLength(2);
    expect(screen.getAllByText('#103')).toHaveLength(1);

    // Every engineer's workload, including the one with nothing open.
    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
    expect(screen.getByText('Bob Li')).toBeInTheDocument();
    expect(screen.getByText(enUS.dashboard.workload.title)).toBeInTheDocument();
  });

  it('reports a failed load and retries it on demand', async () => {
    // The two mount requests fail; the implementation set in `beforeEach` answers the retry.
    api.request
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    render(<HomePage />, { wrapper: I18n });

    expect(
      await screen.findByText(enUS.dashboard.error.title),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: enUS['status.retry'] }),
    );

    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(4));
    expect(
      screen.queryByText(enUS.dashboard.error.title),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Printer is broken')).toHaveLength(2);
  });

  it('shows the session-expired alert, not a retry, when the API answers 401', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('unauthorized', {
        status: 401,
        method: 'GET',
        url: '/api/itDashboard',
      }),
    );
    const user = userEvent.setup();
    render(<HomePage />, { wrapper: I18n });

    expect(
      await screen.findByText(enUS['status.sessionExpired']),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(enUS.dashboard.error.title),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: enUS.actions.signInAgain }),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
