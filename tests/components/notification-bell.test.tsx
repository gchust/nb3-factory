import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { NotificationBell } from '../../client/components/notification-bell.js';

const { actions, items, unread } = vi.hoisted(() => ({
  actions: {
    mark: vi.fn(async () => undefined),
    readAll: vi.fn(async () => 0),
    pending: false,
  },
  items: { data: undefined as unknown, isLoading: false, isError: false },
  unread: { data: 0 as number | undefined },
}));

vi.mock('@nocobase/app-plugin-notification-in-app/client/inbox', () => ({
  useInboxItems: () => items,
  useInboxUnreadCount: () => unread,
  useInboxActions: () => actions,
  useInboxRefresh: () => undefined,
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function LocationProbe(): ReactElement {
  const location = useLocation();
  return <p data-testid='location'>{location.pathname}</p>;
}

function Providers({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={['/tickets']}>
        {children}
        <LocationProbe />
      </MemoryRouter>
    </TestI18nProvider>
  );
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delivery-1',
    deliveryId: 'delivery-1',
    notificationId: 'notification-1',
    title: 'Ticket #2 assigned to you',
    body: 'VPN access is failing',
    target: { type: 'route', path: '/tickets/2' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('notification bell', () => {
  beforeEach(() => {
    actions.mark.mockClear();
    actions.readAll.mockClear();
    unread.data = 1;
    items.isLoading = false;
    items.isError = false;
    items.data = { pages: [{ data: [item()] }] };
  });

  it('shows the unread count and opens the newest notifications', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />, { wrapper: Providers });

    const trigger = screen.getByRole('button', {
      name: enUS.notifications.open,
    });
    expect(trigger).toHaveTextContent('1');

    await user.click(trigger);

    expect(await screen.findByText('Ticket #2 assigned to you')).toBeVisible();
    expect(screen.getByText(enUS.notifications.viewAll)).toHaveAttribute(
      'href',
      '/inbox',
    );
  });

  it('marks a notification read and opens the ticket it is about', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />, { wrapper: Providers });

    await user.click(
      screen.getByRole('button', { name: enUS.notifications.open }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: /Ticket #2 assigned to you/,
      }),
    );

    expect(actions.mark).toHaveBeenCalledWith('delivery-1', 'read');
    expect(screen.getByTestId('location')).toHaveTextContent('/tickets/2');
  });

  it('offers the inbox when there is nothing new', async () => {
    const user = userEvent.setup();
    unread.data = 0;
    items.data = { pages: [{ data: [] }] };
    render(<NotificationBell />, { wrapper: Providers });

    const trigger = screen.getByRole('button', {
      name: enUS.notifications.open,
    });
    expect(trigger).not.toHaveTextContent('1');
    await user.click(trigger);

    expect(await screen.findByText(enUS.notifications.empty)).toBeVisible();
  });
});
