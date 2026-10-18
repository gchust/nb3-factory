import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import {
  MemoryRouter,
  Outlet,
  Route,
  RouterProvider,
  Routes,
  createMemoryRouter,
} from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import TicketDetailPage from '../../client/pages/tickets/detail.js';
import TicketListPage from '../../client/pages/tickets/index.js';
import type {
  ServiceDeskTicket,
  TicketListResult,
} from '../../client/pages/tickets/types.js';

const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
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

function Providers({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={['/tickets']}>
        <Routes>
          <Route path='/tickets' element={children} />
        </Routes>
      </MemoryRouter>
    </TestI18nProvider>
  );
}

const summary = {
  id: 8,
  title: 'Laptop will not start',
  description: 'The power light blinks.',
  status: 'assigned' as const,
  priority: 'high' as const,
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
  commentCount: 0,
  overdue: false,
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

const list: TicketListResult = {
  items: [summary],
  total: 1,
  canCreate: true,
};

const detail: ServiceDeskTicket = {
  ...summary,
  activities: [],
  availableActions: ['comment', 'assign'],
};

describe('ticket list', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('lists tickets and offers creation to someone who may create', async () => {
    api.request.mockResolvedValue({ data: list });
    render(<TicketListPage />, { wrapper: Providers });

    expect(await screen.findByText('Laptop will not start')).toBeVisible();
    expect(
      screen.getByRole('link', { name: enUS.serviceDesk.ticket.new }),
    ).toHaveAttribute('href', '/tickets/new');
    expect(
      screen.getByRole('link', { name: /Laptop will not start/ }),
    ).toHaveAttribute('href', '/tickets/8');
  });

  it('hides creation when the account has no create permission', async () => {
    api.request.mockResolvedValue({
      data: { ...list, canCreate: false },
    });
    render(<TicketListPage />, { wrapper: Providers });

    expect(await screen.findByText('Laptop will not start')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: enUS.serviceDesk.ticket.new }),
    ).not.toBeInTheDocument();
  });
});

describe('ticket detail', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('shows only the actions available to the current user and posts a comment', async () => {
    const user = userEvent.setup();
    api.request.mockImplementation(
      async (options: { path: string; method?: string; json?: unknown }) => {
        if (
          options.path === 'service-desk/tickets/8' &&
          options.method === undefined
        ) {
          return { data: detail };
        }
        if (options.path === 'service-desk/assignees') {
          return {
            data: [{ id: 'user-2', name: 'Grace Hopper', email: 'g@x' }],
          };
        }
        if (
          options.path === 'service-desk/tickets/8/comments' &&
          options.method === 'POST'
        ) {
          return {
            data: {
              ...detail,
              commentCount: 1,
              activities: [
                {
                  id: 1,
                  authorId: 'user-1',
                  authorName: 'Ada Lovelace',
                  kind: 'comment',
                  body: (options.json as { body: string }).body,
                  createdAt: '2026-01-01T11:00:00.000Z',
                },
              ],
            },
          };
        }
        throw new Error(`Unexpected request ${options.path}`);
      },
    );

    const router = createMemoryRouter(
      [
        {
          path: '/tickets',
          element: <Outlet />,
          children: [{ path: ':ticketId', element: <TicketDetailPage /> }],
        },
      ],
      { initialEntries: ['/tickets/8'] },
    );
    render(
      <TestI18nProvider runtime={runtime}>
        <RouterProvider router={router} />
      </TestI18nProvider>,
    );

    expect(await screen.findByText('The power light blinks.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: enUS.serviceDesk.actions.resolve }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: enUS.serviceDesk.actions.assign }),
    ).toBeVisible();

    await user.type(
      screen.getByRole('textbox', {
        name: enUS.serviceDesk.ticket.addComment,
      }),
      'A replacement charger is on the way.',
    );
    await user.click(
      screen.getByRole('button', { name: enUS.serviceDesk.actions.comment }),
    );

    expect(
      await screen.findByText('A replacement charger is on the way.'),
    ).toBeVisible();
    expect(toaster.show).toHaveBeenCalledWith({
      type: 'success',
      title: enUS.serviceDesk.actionSuccess.comment,
    });
  });
});

describe('select labels', () => {
  beforeEach(() => {
    api.request.mockReset();
  });

  it('shows the translated filter label instead of the raw value', async () => {
    api.request.mockResolvedValue({ data: list });
    render(<TicketListPage />, { wrapper: Providers });

    await screen.findByText('Laptop will not start');
    expect(
      screen.getByRole('combobox', { name: enUS.serviceDesk.ticket.status }),
    ).toHaveTextContent(enUS.serviceDesk.filters.allStatuses);
  });

  it('shows the engineer name instead of the user id in the assignee picker', async () => {
    api.request.mockImplementation(
      async (options: { path: string; method?: string }) => {
        if (
          options.path === 'service-desk/tickets/8' &&
          options.method === undefined
        ) {
          return { data: detail };
        }
        if (options.path === 'service-desk/assignees') {
          return {
            data: [{ id: 'user-2', name: 'Grace Hopper', email: 'g@x' }],
          };
        }
        throw new Error(`Unexpected request ${options.path}`);
      },
    );
    const router = createMemoryRouter(
      [
        {
          path: '/tickets',
          element: <Outlet />,
          children: [{ path: ':ticketId', element: <TicketDetailPage /> }],
        },
      ],
      { initialEntries: ['/tickets/8'] },
    );
    render(
      <TestI18nProvider runtime={runtime}>
        <RouterProvider router={router} />
      </TestI18nProvider>,
    );

    const picker = await screen.findByRole('combobox', {
      name: enUS.serviceDesk.ticket.assignTo,
    });
    expect(picker).toHaveTextContent('Grace Hopper');
    expect(picker).not.toHaveTextContent('user-2');
  });
});
