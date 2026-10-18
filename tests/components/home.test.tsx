import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  const client = { request };
  return { ...actual, useApiClient: () => client };
});

import HomePage from '../../client/pages/home/index.js';

const overview = {
  role: 'service-desk',
  stats: { pending: 3, overdue: 1, open: 5, resolved: 7, total: 12 },
  workload: [
    { id: 'user-2', name: 'Bob', count: 2 },
    { id: 'user-3', name: 'Carol', count: 1 },
  ],
  recent: [
    {
      id: 'ticket-1',
      title: 'Printer jam on the third floor',
      status: 'assigned',
      priority: 'high',
      category: 'hardware',
      reporterId: 'user-1',
      reporterName: 'Alice',
      assigneeId: 'user-2',
      assigneeName: 'Bob',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-02T09:00:00.000Z',
    },
  ],
};

let runtime: I18nRuntime;
beforeEach(async () => {
  request.mockReset();
  request.mockResolvedValue({ data: overview });
  runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init('en-US');
});

function Frame({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <MemoryRouter initialEntries={['/']}>
      <I18nProvider runtime={runtime}>{children}</I18nProvider>
    </MemoryRouter>
  );
}

describe('home page', () => {
  it('shows the help-desk counts and the most recently updated tickets', async () => {
    render(
      <Frame>
        <HomePage />
      </Frame>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Help desk' }),
    ).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith({
      path: 'helpdesk/overview',
      signal: expect.any(AbortSignal),
    });
    expect(screen.getByText('Awaiting assignment')).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Printer jam on the third floor' }),
    ).toHaveAttribute('href', '/tickets/ticket-1');
  });

  it('lists the engineer workload for the service desk', async () => {
    render(
      <Frame>
        <HomePage />
      </Frame>,
    );

    expect(await screen.findByText('Carol')).toBeVisible();
    // Bob is both in the workload list and the assignee of the recent ticket.
    expect(screen.getAllByText('Bob')).toHaveLength(2);
    expect(screen.getByText('2 open')).toBeVisible();
  });

  it('hides the workload from a role that does not dispatch', async () => {
    request.mockResolvedValue({ data: { ...overview, role: 'employee' } });
    render(
      <Frame>
        <HomePage />
      </Frame>,
    );

    await screen.findByText('Printer jam on the third floor');
    expect(screen.queryByText('Engineer workload')).not.toBeInTheDocument();
  });

  it('reports a failed load with a retry that asks again', async () => {
    request.mockRejectedValue(new Error('network down'));
    render(
      <Frame>
        <HomePage />
      </Frame>,
    );

    expect(
      await screen.findByText('Unable to load the help desk'),
    ).toBeVisible();
    expect(request).toHaveBeenCalledTimes(1);
    screen.getByRole('button', { name: 'Retry' }).click();
    await screen.findByText('Unable to load the help desk');
    expect(request).toHaveBeenCalledTimes(2);
  });
});
