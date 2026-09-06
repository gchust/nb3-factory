import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import ItServiceDeskListPage from '../../client/pages/it-service-desk.js';

const APP_NAMESPACE = 'nb3-factory';

const { mockClientState, mockUseService } = vi.hoisted(() => {
  const state: { client: unknown } = { client: undefined };
  return {
    mockClientState: state,
    mockUseService: (_token: unknown) => state.client,
  };
});

vi.mock('@nocobase/app-client', () => ({
  appApiClientToken: { id: '@nocobase/app-client/app-api-client' },
  useService: mockUseService,
  AppRequestError: class AppRequestError extends Error {},
}));

const ALL_TICKETS = [
  {
    id: 1,
    title: 'Cannot connect to the office Wi-Fi',
    description: 'Laptop cannot see the office network.',
    category: 'network',
    priority: 'high',
    status: 'pending',
    requesterId: 'user-1',
    assigneeId: null,
    resolution: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    requesterName: 'Wei Zhang',
    assigneeName: null,
  },
  {
    id: 2,
    title: 'Printer in the HR office not printing',
    description: 'The HR printer shows an offline error.',
    category: 'hardware',
    priority: 'normal',
    status: 'inProgress',
    requesterId: 'user-2',
    assigneeId: 'user-3',
    resolution: null,
    createdAt: '2026-09-02T08:00:00.000Z',
    updatedAt: '2026-09-02T08:00:00.000Z',
    requesterName: 'Na Li',
    assigneeName: 'Yang Liu',
  },
];

let runtime: I18nRuntime;

beforeAll(async () => {
  runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    applicationNamespace: APP_NAMESPACE,
  });
  runtime.registerApplicationNamespace(APP_NAMESPACE, {
    'en-US': () => Promise.resolve(enUS),
  });
  await runtime.init('en-US');
});

function createAppClient() {
  const request = vi.fn(async (url: string) => {
    const search = new URL(url, 'http://localhost').searchParams.get('search');
    const items = search
      ? ALL_TICKETS.filter(
          (ticket) =>
            ticket.title.toLowerCase().includes(search.toLowerCase()) ||
            ticket.description.toLowerCase().includes(search.toLowerCase()),
        )
      : ALL_TICKETS;
    return {
      data: items,
      meta: { total: items.length, page: 1, pageSize: 10 },
    };
  });
  const appClient = { request };
  mockClientState.client = appClient;
  return appClient;
}

function renderPage() {
  return render(
    <I18nProvider runtime={runtime}>
      <NamespaceScope ns={APP_NAMESPACE}>
        <MemoryRouter>
          <ItServiceDeskListPage />
        </MemoryRouter>
      </NamespaceScope>
    </I18nProvider>,
  );
}

describe('IT service desk list page search', () => {
  it('renders the seeded tickets', async () => {
    createAppClient();
    renderPage();

    expect(
      await screen.findByText('Cannot connect to the office Wi-Fi'),
    ).toBeDefined();
    expect(
      screen.getByText('Printer in the HR office not printing'),
    ).toBeDefined();
  });

  it('filters the list while typing a search term', async () => {
    const appClient = createAppClient();
    renderPage();
    await screen.findByText('Cannot connect to the office Wi-Fi');

    const searchBox = screen.getByPlaceholderText(
      'Search title or description…',
    );
    fireEvent.change(searchBox, { target: { value: 'printer' } });

    await waitFor(() => {
      expect(appClient.request).toHaveBeenCalledWith(
        expect.stringContaining('search=printer'),
      );
    });
    expect(
      await screen.findByText('Printer in the HR office not printing'),
    ).toBeDefined();
    expect(screen.queryByText('Cannot connect to the office Wi-Fi')).toBeNull();
  });

  it('resets the list when the search box is cleared programmatically', async () => {
    const appClient = createAppClient();
    renderPage();
    await screen.findByText('Cannot connect to the office Wi-Fi');

    const searchBox = screen.getByPlaceholderText(
      'Search title or description…',
    ) as HTMLInputElement;
    fireEvent.change(searchBox, { target: { value: 'printer' } });
    await waitFor(() => {
      expect(appClient.request).toHaveBeenCalledWith(
        expect.stringContaining('search=printer'),
      );
    });
    expect(
      await screen.findByText('Printer in the HR office not printing'),
    ).toBeDefined();

    // A programmatic clear sets the DOM value and dispatches a native input
    // event without going through React's synthetic onChange. The page must
    // still notice the empty value and refetch the full list.
    appClient.request.mockClear();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(searchBox, '');
    fireEvent(searchBox, new Event('input', { bubbles: true }));

    await waitFor(() => {
      expect(appClient.request).toHaveBeenCalledWith(
        expect.not.stringContaining('search='),
      );
    });
    expect(
      await screen.findByText('Cannot connect to the office Wi-Fi'),
    ).toBeDefined();
    expect(
      screen.getByText('Printer in the HR office not printing'),
    ).toBeDefined();
  });
});
