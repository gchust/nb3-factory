// The ticket list and the record page: what the caller may see, the actions the lifecycle allows, and the two writes
// a page makes itself — firing a transition that needs no input and adding a note.
import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { Outlet, createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import TicketsPage from '../../client/pages/tickets/index.js';
import TicketDetailPage from '../../client/pages/tickets/detail/index.js';
import type {
  AvailableTransition,
  ServiceDeskMe,
  TicketListItem,
  TicketNote,
  TicketView,
} from '../../client/hooks/service-desk.js';

interface RequestOptions {
  readonly path: string;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly method?: string;
  readonly json?: unknown;
}

// `vi.mock` factories run before this file's imports and code, so everything a factory uses is created here.
const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn<(options: RequestOptions) => Promise<unknown>>() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the pages check with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh: vi.fn() }),
}));

// Strict: a key the locale lacks fails the test instead of rendering as text.
const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

const T = enUS.serviceDesk;

function me(overrides: Partial<ServiceDeskMe> = {}): ServiceDeskMe {
  return {
    userId: 'u1',
    name: 'Dana',
    email: 'dana@example.com',
    helpdesk: false,
    engineer: false,
    ...overrides,
  };
}

function listItem(overrides: Partial<TicketListItem> = {}): TicketListItem {
  return {
    id: 1,
    title: 'Projector has no signal',
    description: 'The projector shows no signal for every cable.',
    category: 'hardware',
    location: 'Room 12',
    urgency: 'high',
    status: 'submitted',
    statusChangedAt: '2026-01-02T03:04:05.000Z',
    lifecycleVersion: 1,
    requesterId: 'u2',
    assigneeId: null,
    solution: null,
    returnReason: null,
    attachmentIds: null,
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-02T03:04:05.000Z',
    requesterName: 'Frank',
    assigneeName: null,
    overdue: false,
    ...overrides,
  };
}

function transition(
  name: string,
  allowed = true,
  blockers: AvailableTransition['blockers'] = [],
): AvailableTransition {
  return { name, title: name, to: [], allowed, blockers };
}

function view(overrides: Partial<TicketView> = {}): TicketView {
  return {
    record: listItem(),
    state: 'submitted',
    version: 1,
    available: [transition('assign'), transition('cancel')],
    history: {
      transitions: [
        {
          id: 1,
          transition: '$create',
          from: null,
          to: 'submitted',
          actorId: 'u2',
          at: '2026-01-02T03:04:05.000Z',
          version: 1,
        },
      ],
      effectRuns: [],
    },
    requester: { id: 'u2', name: 'Frank', email: 'frank@example.com' },
    assignee: null,
    overdue: false,
    ...overrides,
  };
}

const note: TicketNote = {
  id: 9,
  ticketId: 1,
  authorId: 'u1',
  kind: 'handling',
  content: 'Replaced the HDMI cable.',
  createdAt: '2026-01-02T05:00:00.000Z',
  authorName: 'Dana',
};

/** The request the list or detail made, by path — and by method when one path is both read and written. */
function requestFor(path: string, method?: string): RequestOptions | undefined {
  return api.request.mock.calls
    .map(([options]) => options)
    .find(
      (options) =>
        options.path === path &&
        (method === undefined || options.method === method),
    );
}

function renderList(initialEntry = '/tickets'): void {
  const router = createMemoryRouter(
    [
      {
        path: '/tickets',
        element: <TicketsPage />,
        children: [
          { path: 'new', element: <div>create dialog</div> },
          { path: ':ticketId', element: <div>detail</div> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
}

/** A parent route supplying the outlet context the record page reads, so it can be rendered on its own. */
function Shell(): ReactElement {
  return <Outlet context={{ reload: vi.fn() }} />;
}

function renderDetail(initialEntry = '/tickets/1'): void {
  const router = createMemoryRouter(
    [
      {
        path: '/tickets',
        element: <Shell />,
        children: [
          {
            path: ':ticketId',
            element: <TicketDetailPage />,
            children: [
              { path: 'assign', element: <div>assign dialog</div> },
              { path: 'reassign', element: <div /> },
              { path: 'resolve', element: <div /> },
              { path: 'return', element: <div /> },
              { path: 'cancel', element: <div /> },
            ],
          },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
}

describe('the ticket list', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('reads the filters from the URL and lists what the caller may see', async () => {
    api.request.mockImplementation(async ({ path }) => {
      if (path === 'serviceDesk/me') return { data: me({ helpdesk: true }) };
      return {
        data: [listItem(), listItem({ id: 2, title: 'Printer jam' })],
        meta: { total: 2 },
      };
    });
    renderList('/tickets?status=submitted&overdue=true');

    expect(await screen.findByText('Projector has no signal')).toBeVisible();
    expect(screen.getByText('Printer jam')).toBeVisible();
    expect(
      screen.getByText(T.tickets.number.replace('{{id}}', '1')),
    ).toBeVisible();

    const list = requestFor('serviceDesk/tickets');
    expect(list?.query).toMatchObject({
      scope: 'all',
      status: 'submitted',
      overdue: 'true',
    });
  });

  it('links a row to the record page, keeping the filters', async () => {
    api.request.mockImplementation(async ({ path }) => {
      if (path === 'serviceDesk/me') return { data: me({ helpdesk: true }) };
      return { data: [listItem()], meta: { total: 1 } };
    });
    renderList('/tickets?status=submitted');

    const link = (await screen.findByText('Projector has no signal')).closest(
      'a',
    );
    expect(link).toHaveAttribute('href', '/tickets/1?status=submitted');
  });

  it('offers the raise action when there is nothing yet', async () => {
    api.request.mockImplementation(async ({ path }) => {
      if (path === 'serviceDesk/me') return { data: me() };
      return { data: [], meta: { total: 0 } };
    });
    renderList();

    expect(await screen.findByText(T.tickets.empty)).toBeVisible();
    const raise = screen.getByRole('button', { name: T.tickets.new });
    expect(raise).toHaveAttribute('href', '/tickets/new');
  });

  it('tells "no matches" from "nothing yet" and clears the filters', async () => {
    api.request.mockImplementation(async ({ path }) => {
      if (path === 'serviceDesk/me') return { data: me() };
      return { data: [], meta: { total: 0 } };
    });
    renderList('/tickets?status=closed');

    expect(await screen.findByText(T.tickets.noResults)).toBeVisible();
    expect(screen.queryByText(T.tickets.empty)).not.toBeInTheDocument();
    // The filter bar and the empty state both offer it.
    expect(
      screen.getAllByRole('button', { name: T.tickets.clearFilters }).length,
    ).toBeGreaterThan(0);
  });

  it('reports a failed list and retries it', async () => {
    const user = userEvent.setup();
    api.request.mockImplementation(async ({ path }) => {
      if (path === 'serviceDesk/me') return { data: me() };
      throw new ApiClientError('boom', {
        status: 500,
        method: 'get',
        url: '/api/serviceDesk/tickets',
      });
    });
    renderList();

    expect(await screen.findByText(T.error.title)).toBeVisible();
    const before = api.request.mock.calls.length;
    await user.click(
      screen.getByRole('button', { name: enUS['status.retry'] }),
    );
    await waitFor(() =>
      expect(api.request.mock.calls.length).toBeGreaterThan(before),
    );
  });
});

describe('the ticket record page', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  function respondDetail(
    record: TicketView,
    notes: readonly TicketNote[] = [],
    meValue: ServiceDeskMe = me(),
  ): void {
    api.request.mockImplementation(async ({ path }) => {
      if (path === 'serviceDesk/me') return { data: meValue };
      if (path.endsWith('/notes')) return { data: notes };
      if (path.endsWith('/fire')) return { data: record };
      return { data: record };
    });
  }

  it('shows the record, its history and the actions the lifecycle allows', async () => {
    respondDetail(
      view({
        available: [transition('assign'), transition('cancel')],
      }),
      [],
      me({ helpdesk: true }),
    );
    renderDetail();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Projector has no signal',
      }),
    ).toBeVisible();
    expect(
      screen.getByText('The projector shows no signal for every cable.'),
    ).toBeVisible();
    expect(screen.getByText(T.detail.created)).toBeVisible();
    // An input transition is a link to its own child route; the exit is behind the overflow menu.
    expect(
      screen.getByRole('button', { name: T.transition.assign.label }),
    ).toHaveAttribute('href', '/tickets/1/assign');
    expect(
      screen.getByRole('button', { name: T.detail.moreActions }),
    ).toBeVisible();
  });

  it('fires a transition that needs no input', async () => {
    const user = userEvent.setup();
    respondDetail(
      view({
        state: 'assigned',
        record: listItem({ status: 'assigned', assigneeId: 'u1' }),
        available: [transition('start'), transition('resolve')],
      }),
      [],
      me({ engineer: true, userId: 'u1' }),
    );
    renderDetail();

    await user.click(
      await screen.findByRole('button', {
        name: T.transition.start.label,
      }),
    );

    await waitFor(() => {
      const fired = requestFor('serviceDesk/tickets/1/fire');
      expect(fired?.method).toBe('POST');
      expect(fired?.json).toMatchObject({ transition: 'start' });
    });
    expect(toaster.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('adds a note as the assigned engineer', async () => {
    const user = userEvent.setup();
    respondDetail(
      view({
        state: 'assigned',
        record: listItem({ status: 'assigned', assigneeId: 'u1' }),
        available: [transition('start')],
      }),
      [],
      me({ engineer: true, userId: 'u1' }),
    );
    renderDetail();

    const box = await screen.findByLabelText(T.detail.notePlaceholder);
    await user.type(box, 'Replaced the HDMI cable.');
    await user.click(screen.getByRole('button', { name: T.detail.addNote }));

    await waitFor(() => {
      const added = requestFor('serviceDesk/tickets/1/notes', 'POST');
      expect(added?.method).toBe('POST');
      expect(added?.json).toMatchObject({
        content: 'Replaced the HDMI cable.',
        kind: 'handling',
      });
    });
  });

  it('shows the notes already recorded', async () => {
    respondDetail(
      view({ available: [transition('assign')] }),
      [note],
      me({ helpdesk: true }),
    );
    renderDetail();

    const notes = await screen.findByText('Replaced the HDMI cable.');
    expect(notes).toBeVisible();
    const item = notes.closest('li');
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).getByText('Dana')).toBeVisible();
  });

  it('reports a ticket the caller cannot see', async () => {
    api.request.mockImplementation(async ({ path }) => {
      if (path === 'serviceDesk/me') return { data: me() };
      if (path.endsWith('/notes')) return { data: [] };
      throw new ApiClientError('not found', {
        status: 404,
        method: 'get',
        url: '/api/serviceDesk/tickets/1',
      });
    });
    renderDetail();

    expect(await screen.findByText(T.error.title)).toBeVisible();
    expect(screen.getByText(T.detail.notFound)).toBeVisible();
  });
});
