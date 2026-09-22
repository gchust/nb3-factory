import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  subscribeToInboxInvalidations: vi.fn(() => () => undefined),
}));

vi.mock('@nocobase/app-client', () => ({
  realtimeClientToken: 'realtime-client',
  useApiClient: () => ({ request: mocks.request }),
  useService: () => ({
    onOpen: () => () => undefined,
    subscribe: () => () => undefined,
  }),
}));

vi.mock('@nocobase/app-plugin-notification-in-app/client', () => ({
  subscribeToInboxInvalidations: mocks.subscribeToInboxInvalidations,
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Imported after the mocks so the page resolves the stubbed modules.
import ServiceMessagesPage from '../../client/pages/service/messages.js';

function renderPage(): ReactElement {
  return (
    <MemoryRouter basename='/main' initialEntries={['/main/service/messages']}>
      <ServiceMessagesPage />
    </MemoryRouter>
  );
}

describe('service messages page', () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.subscribeToInboxInvalidations.mockClear();
  });

  it('links to a ticket through the router so the app base path is applied', async () => {
    mocks.request.mockImplementation(async ({ path }: { path: string }) => {
      if (path.startsWith('notifications/in-app?'))
        return {
          data: [
            {
              id: '1',
              body: 'A ticket was dispatched to you.',
              actionUrl: '/service/tickets/2',
              createdAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        };
      if (path === 'notifications/in-app/unread-count') return { count: 1 };
      throw new Error(`Unexpected path: ${path}`);
    });

    render(renderPage());

    const link = await screen.findByRole('link', {
      name: 'service.messages.open',
    });
    expect(link).toHaveAttribute('href', '/main/service/tickets/2');
  });

  it('subscribes to realtime invalidations for reconnect recovery', async () => {
    mocks.request.mockImplementation(async ({ path }: { path: string }) => {
      if (path.startsWith('notifications/in-app?')) return { data: [] };
      if (path === 'notifications/in-app/unread-count') return { count: 0 };
      throw new Error(`Unexpected path: ${path}`);
    });

    render(renderPage());
    await screen.findByText('service.messages.empty');
    expect(mocks.subscribeToInboxInvalidations).toHaveBeenCalled();
  });
});
