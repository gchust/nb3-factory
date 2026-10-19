import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import TicketDetailPage from '../../client/pages/it-tickets/detail.js';
import ItTicketsPage from '../../client/pages/it-tickets/index.js';
import NewTicketPage from '../../client/pages/it-tickets/new.js';
import type {
  TicketDashboard,
  TicketDetail,
} from '../../client/pages/it-tickets/types.js';

const { api, toaster, permission } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
  permission: { can: true, isPending: false, error: undefined as unknown },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh: vi.fn() }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({
    can: permission.can,
    isPending: permission.isPending,
    error: permission.error,
    retry: vi.fn(),
  }),
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

const dashboard: TicketDashboard = {
  pendingAssignment: 1,
  inProgress: 0,
  resolvedAwaiting: 0,
  overdue: 0,
  myOpen: 0,
  canAssign: false,
  overdueAfterHours: 24,
  workload: [],
  recent: [],
  generatedAt: '2026-10-07T00:00:00.000Z',
};

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function pngFile(name = 'error.png'): File {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (character) =>
    character.charCodeAt(0),
  );
  return new File([bytes.buffer as ArrayBuffer], name, { type: 'image/png' });
}

const detail: TicketDetail = {
  id: 42,
  number: 'IT-42',
  title: 'Laptop will not start',
  description: 'Nothing happens when I press the power button.',
  urgency: 'high',
  status: 'resolved',
  requesterId: 'employee-1',
  requesterName: 'Eva Employee',
  assigneeId: 'engineer-1',
  assigneeName: 'Erin Engineer',
  statusChangedAt: '2026-10-07T09:00:00.000Z',
  assignedAt: '2026-10-07T08:00:00.000Z',
  resolvedAt: '2026-10-07T09:00:00.000Z',
  closedAt: null,
  returnedAt: null,
  createdAt: '2026-10-07T07:00:00.000Z',
  updatedAt: '2026-10-07T09:00:00.000Z',
  resolution: 'Replaced the power supply.',
  activities: [],
  attachments: [],
  permissions: {
    canAssign: false,
    canProgress: false,
    canResolve: false,
    canClose: true,
    canReturn: false,
    canComment: false,
  },
};

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <TestI18nProvider runtime={runtime}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </TestI18nProvider>
  );
}

function Layout(): ReactElement {
  return <ItTicketsPage />;
}

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/it-tickets',
        element: <Layout />,
        children: [
          { path: 'new', element: <NewTicketPage /> },
          { path: ':ticketId', element: <TicketDetailPage /> },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

function stubApi(): void {
  api.request.mockImplementation(
    ({ path, method }: { readonly path: string; readonly method?: string }) => {
      if (path === '/tickets/dashboard') {
        return Promise.resolve({ data: dashboard });
      }
      if (path === '/tickets' && method === 'POST') {
        return Promise.resolve({ data: detail });
      }
      if (path === '/tickets') {
        return Promise.resolve({
          data: [
            {
              ...detail,
              status: 'pending',
              resolution: undefined,
              activities: undefined,
              attachments: undefined,
              permissions: undefined,
            },
          ],
          meta: { total: 1, page: 1, pageSize: 20 },
        });
      }
      if (path === '/tickets/42') return Promise.resolve({ data: detail });
      if (path === '/tickets/engineers') {
        return Promise.resolve({
          data: [
            {
              id: 'engineer-1',
              name: 'Erin Engineer',
              email: 'erin@example.com',
            },
          ],
        });
      }
      if (path === '/tickets/42/close') {
        return Promise.resolve({
          data: {
            ...detail,
            status: 'closed',
            permissions: { ...detail.permissions, canClose: false },
          },
        });
      }
      if (path === '/itTicketFiles/uploadMany') {
        return Promise.resolve({
          data: {
            createdCount: 1,
            records: [
              {
                id: 'file-1',
                filename: 'error.png',
                mimeType: 'image/png',
                size: 6,
                contentUrl: '/uploads/it-tickets/error.png',
              },
            ],
          },
        });
      }
      return Promise.reject(
        new Error(`Unexpected request: ${method ?? 'GET'} ${path}`),
      );
    },
  );
}

describe('IT service desk pages', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    permission.can = true;
    permission.isPending = false;
    permission.error = undefined;
    detail.permissions.canAssign = false;
    stubApi();
  });

  it('shows the overview and keeps the list filters in ticket links', async () => {
    const router = renderAt('/it-tickets?q=laptop&status=open');

    expect(
      await screen.findByText('Laptop will not start'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enUS.itTickets.dashboard.pendingAssignment),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Laptop will not start' });
    expect(link).toHaveAttribute('href', '/it-tickets/42?q=laptop&status=open');
    expect(
      screen.getByRole('link', { name: enUS.itTickets.actions.newTicket }),
    ).toHaveAttribute('href', '/it-tickets/new?q=laptop&status=open');
    expect(
      screen.getByRole('combobox', { name: enUS.itTickets.filters.status }),
    ).toHaveTextContent(enUS.itTickets.filters.openStatuses);
    expect(
      screen.getByRole('combobox', { name: enUS.itTickets.filters.urgency }),
    ).toHaveTextContent(enUS.itTickets.filters.allUrgencies);

    await userEvent.click(
      screen.getByRole('button', { name: enUS.itTickets.columns.number }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toContain('sort=number'),
    );
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/tickets',
        query: expect.objectContaining({
          q: 'laptop',
          status: 'open',
          sort: 'number',
        }),
      }),
    );
  });

  it('hides the create action without permission', async () => {
    permission.can = false;
    renderAt('/it-tickets');

    await screen.findByText('Laptop will not start');
    expect(
      screen.queryByRole('link', { name: enUS.itTickets.actions.newTicket }),
    ).not.toBeInTheDocument();
  });

  it('uploads a screenshot and opens the created ticket', async () => {
    const router = renderAt('/it-tickets/new?q=laptop');
    const title = await screen.findByLabelText(enUS.itTickets.fields.title);
    await userEvent.type(title, 'Printer is offline');
    await userEvent.type(
      screen.getByLabelText(enUS.itTickets.fields.description),
      'The office printer does not appear on the network.',
    );
    await userEvent.upload(
      screen.getByLabelText(enUS.itTickets.fields.screenshots),
      pngFile(),
    );
    expect(screen.getByText('error.png')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: enUS.itTickets.create.addMoreFiles }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: enUS.itTickets.create.submit }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/tickets',
          method: 'POST',
          json: expect.objectContaining({
            title: 'Printer is offline',
            fileIds: ['file-1'],
          }),
        }),
      ),
    );
    const upload = api.request.mock.calls.find(
      ([request]) => request.path === '/itTicketFiles/uploadMany',
    );
    expect(upload?.[0].body).toBeInstanceOf(FormData);
    expect((upload?.[0].body as FormData).getAll('file')).toHaveLength(1);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/it-tickets/42'),
    );
    expect(router.state.location.search).toBe('?q=laptop');
    expect(toaster.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('rejects a damaged screenshot before uploading it', async () => {
    renderAt('/it-tickets/new');

    fireEvent.change(screen.getByLabelText(enUS.itTickets.fields.screenshots), {
      target: {
        files: [
          new File(['This is not PNG image data.\n'], 'corrupt.png', {
            type: 'image/png',
          }),
        ],
      },
    });

    expect(
      await screen.findByText(
        enUS.itTickets.create.corruptFile.replace('{{name}}', 'corrupt.png'),
      ),
    ).toBeVisible();
    expect(api.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: '/itTicketFiles/uploadMany' }),
    );
  });

  it('rejects an unsupported file chosen despite the picker filter', async () => {
    renderAt('/it-tickets/new');

    fireEvent.change(screen.getByLabelText(enUS.itTickets.fields.screenshots), {
      target: {
        files: [
          new File(['MZ not an image'], 'unsupported.exe', {
            type: 'application/octet-stream',
          }),
        ],
      },
    });

    expect(
      await screen.findByText(
        enUS.itTickets.create.unsupportedFile.replace(
          '{{name}}',
          'unsupported.exe',
        ),
      ),
    ).toBeVisible();
    expect(api.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: '/itTicketFiles/uploadMany' }),
    );
  });

  it('shows an assigned engineer by name rather than a raw identifier', async () => {
    detail.permissions.canAssign = true;
    renderAt('/it-tickets/42');

    await userEvent.click(
      await screen.findByRole('button', {
        name: enUS.itTickets.actions.reassign,
      }),
    );
    const engineer = await screen.findByRole('combobox', {
      name: enUS.itTickets.fields.assignee,
    });
    expect(engineer).toHaveTextContent('Erin Engineer');
    expect(engineer).not.toHaveTextContent('engineer-1');
  });

  it('confirms before closing a ticket and sends the close action', async () => {
    renderAt('/it-tickets/42');

    await userEvent.click(
      await screen.findByRole('button', { name: enUS.itTickets.actions.close }),
    );
    expect(
      screen.getByRole('alertdialog', {
        name: enUS.itTickets.actionDialog.closeTitle,
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: enUS.itTickets.actions.close }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/tickets/42/close', method: 'POST' }),
      ),
    );
    expect(toaster.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });
});
