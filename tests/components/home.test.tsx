import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import HomePage from '../../client/pages/home/index.js';
import type { TicketDashboard } from '../../client/pages/it-tickets/types.js';

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

const dashboard: TicketDashboard = {
  pendingAssignment: 4,
  inProgress: 3,
  resolvedAwaiting: 2,
  overdue: 1,
  myOpen: 1,
  canAssign: true,
  overdueAfterHours: 24,
  workload: [
    {
      id: 'engineer-1',
      name: 'Erin Engineer',
      email: 'erin@example.com',
      open: 3,
      overdue: 1,
    },
  ],
  recent: [],
  generatedAt: '2026-10-07T00:00:00.000Z',
};

function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <TestI18nProvider runtime={runtime}>
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </TestI18nProvider>
  );
}

describe('home page', () => {
  beforeEach(() => {
    api.request.mockReset();
    api.request.mockResolvedValue({ data: dashboard });
  });

  it('shows the service desk overview instead of the template introduction', async () => {
    render(<HomePage />, { wrapper: Wrapper });

    expect(
      screen.getByRole('heading', { level: 1, name: enUS.itTickets.title }),
    ).toBeVisible();
    expect(
      await screen.findByText(enUS.itTickets.dashboard.title),
    ).toBeVisible();
    expect(
      screen.getByText(enUS.itTickets.dashboard.pendingAssignment),
    ).toBeVisible();
    expect(screen.getByText('4')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    expect(screen.getByText('1')).toBeVisible();
    expect(screen.getByText('Erin Engineer')).toBeVisible();
    expect(
      screen.getByText(
        enUS.itTickets.dashboard.engineerLoad
          .replace('{{open}}', '3')
          .replace('{{overdue}}', '1'),
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(enUS.home.capabilitiesTitle),
    ).not.toBeInTheDocument();
  });

  it('links from the overview to the full ticket queue', async () => {
    render(<HomePage />, { wrapper: Wrapper });

    expect(
      await screen.findByRole('link', {
        name: enUS.itTickets.actions.viewTickets,
      }),
    ).toHaveAttribute('href', '/it-tickets');
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/tickets/dashboard' }),
    );
  });
});
