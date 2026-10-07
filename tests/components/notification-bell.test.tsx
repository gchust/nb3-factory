import { NotificationInAppRuntimeContext } from '@nocobase/app-plugin-notification-in-app/client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';

import { NotificationBell } from '../../client/components/notification-bell.js';
import enUS from '../../client/locales/en-US.js';

const runtime = await createTestI18nRuntime({
  application: { namespace: 'nb3-factory', resources: enUS },
  strict: true,
});

function withProviders(children: ReactNode, unreadCount?: number): ReactNode {
  const content =
    unreadCount === undefined ? (
      children
    ) : (
      <NotificationInAppRuntimeContext.Provider
        value={{ unreadCount, refresh: () => {}, revision: 0 }}
      >
        {children}
      </NotificationInAppRuntimeContext.Provider>
    );
  return (
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter>{content}</MemoryRouter>
    </TestI18nProvider>
  );
}

it('links to the message center without a badge when no inbox provider is mounted', () => {
  render(withProviders(<NotificationBell />));
  expect(screen.getByRole('link', { name: 'Notifications' })).toHaveAttribute(
    'href',
    '/notifications',
  );
});

it('shows the shared unread count, capped at 99+', () => {
  const { unmount } = render(withProviders(<NotificationBell />, 3));
  expect(screen.getByText('3')).toBeVisible();
  unmount();

  render(withProviders(<NotificationBell />, 150));
  expect(screen.getByText('99+')).toBeVisible();
});
