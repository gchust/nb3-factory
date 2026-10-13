// The landing page, which is the service desk's overview: what is waiting for the person looking at it, what is
// waiting for the whole desk, and how the engineers are loaded. It loads through `useApiClient`, so the module is
// mocked rather than a network layer.
import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import HomePage from '../../client/pages/home/index.js';
import type { ServiceDeskOverview } from '../../client/hooks/service-desk.js';

// `vi.mock` factories run before this file's imports and code, so everything a factory uses is created here.
const { api } = vi.hoisted(() => ({ api: { request: vi.fn() } }));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the page checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
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

/** The page links into the ticket list and the staff page, so it needs a router to render in. */
function renderHome(): { unmount: () => void } {
  const router = createMemoryRouter(
    [
      { path: '/', element: <HomePage /> },
      { path: '/tickets', element: <div /> },
      { path: '/tickets/new', element: <div /> },
      { path: '/settings/service-desk', element: <div /> },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />, { wrapper: I18n });
}

function overviewOf(
  overrides: Partial<ServiceDeskOverview> = {},
): ServiceDeskOverview {
  return {
    me: { userId: 'u1', helpdesk: true, engineer: false },
    counts: {
      submitted: 2,
      assigned: 1,
      processing: 3,
      resolved: 4,
      returned: 0,
      closed: 5,
      cancelled: 1,
    },
    pendingAssignment: 2,
    overdue: 1,
    open: 6,
    workload: [{ engineerId: 'e1', name: 'Dana', open: 3, overdue: 1 }],
    ...overrides,
  };
}

describe('home page', () => {
  beforeEach(() => {
    api.request.mockReset();
  });

  it('shows what is waiting for the service desk', async () => {
    api.request.mockResolvedValue({ data: overviewOf() });
    renderHome();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: enUS.serviceDesk.home.title,
      }),
    ).toBeVisible();
    // Every card links to the list already filtered to what it counts. The summary section is scoped, because the
    // same state appears again in the by-state list below.
    const summary = (
      await screen.findByLabelText(enUS.serviceDesk.home.summaryLabel)
    ).closest('section');
    expect(summary).not.toBeNull();
    expect(
      await within(summary as HTMLElement).findByRole('link', {
        name: /Awaiting assignment/,
      }),
    ).toHaveAttribute('href', '/tickets?status=submitted');
    expect(
      within(summary as HTMLElement).getByRole('link', {
        name: /Open over 24 hours/,
      }),
    ).toHaveAttribute('href', '/tickets?overdue=true');
    expect(
      within(summary as HTMLElement).getByRole('link', {
        name: /Awaiting confirmation 4/,
      }),
    ).toHaveAttribute('href', '/tickets?status=resolved');
  });

  it('shows each engineer’s load and how much of it is overdue', async () => {
    api.request.mockResolvedValue({ data: overviewOf() });
    renderHome();

    const row = (await screen.findByText('Dana')).closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('3 open')).toBeVisible();
    expect(within(row as HTMLElement).getByText('1 overdue')).toBeVisible();
  });

  it('says so when nobody is carrying anything', async () => {
    api.request.mockResolvedValue({ data: overviewOf({ workload: [] }) });
    renderHome();

    expect(
      await screen.findByText(enUS.serviceDesk.home.noWorkload),
    ).toBeVisible();
  });

  it('reports a failed overview and retries it', async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValue(
      new ApiClientError('boom', {
        status: 500,
        method: 'get',
        url: '/api/serviceDesk/overview',
      }),
    );
    renderHome();

    expect(
      await screen.findByText(enUS.serviceDesk.home.error.title),
    ).toBeVisible();
    const calls = api.request.mock.calls.length;
    await user.click(
      screen.getByRole('button', { name: enUS['status.retry'] }),
    );
    await waitFor(() =>
      expect(api.request.mock.calls.length).toBeGreaterThan(calls),
    );
  });

  it('offers the staff page to the service desk only', async () => {
    api.request.mockResolvedValue({ data: overviewOf() });
    const first = renderHome();
    expect(
      await screen.findByRole('button', {
        name: enUS.serviceDesk.settings.title,
      }),
    ).toBeVisible();
    first.unmount();

    api.request.mockReset();
    api.request.mockResolvedValue({
      data: overviewOf({
        me: { userId: 'u2', helpdesk: false, engineer: false },
      }),
    });
    renderHome();
    await screen.findByText('Dana');
    expect(
      screen.queryByRole('button', { name: enUS.serviceDesk.settings.title }),
    ).not.toBeInTheDocument();
  });
});
