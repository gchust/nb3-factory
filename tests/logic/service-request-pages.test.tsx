import {
  apiClientToken,
  ClientApplicationContext,
  type ApiClient,
  type ClientApplication,
} from '@nocobase/app-client';
import { I18nProvider, I18nRuntime } from '@nocobase/i18n/client';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.ts';
import ServiceRequestDetailPage from '../../client/pages/service-requests/detail.tsx';
import ServiceRequestsPage from '../../client/pages/service-requests/index.tsx';
import type { ServiceRequest } from '../../client/pages/service-requests/api.ts';

const pendingRequest: ServiceRequest = {
  acceptedAt: null,
  assigneeId: 'u1',
  createdAt: '2026-09-25T08:00:00.000Z',
  id: 7,
  result: null,
  status: 'pending',
  title: 'Broken meeting room projector',
  urgent: true,
};

const acceptedRequest: ServiceRequest = {
  ...pendingRequest,
  acceptedAt: '2026-09-25T09:00:00.000Z',
  result: 'urgent',
  status: 'accepted',
};

/**
 * A real i18n runtime over the application's own locale file, so the pages render the wording the application ships
 * rather than a test-local stand-in.
 */
let i18nRuntime: I18nRuntime;

beforeAll(async () => {
  i18nRuntime = new I18nRuntime({
    applicationNamespace: 'test-application',
    defaultLocale: 'en-US',
  });
  i18nRuntime.registerApplicationNamespace('test-application', {
    'en-US': () => Promise.resolve({ default: enUS }),
  });
  await i18nRuntime.init('en-US');
});

/** An API client whose `request` is scripted per path, so a page's calls can be observed. */
function createApiClient(
  handler: (request: {
    path: string;
    method?: string;
  }) => unknown | Promise<unknown>,
): { api: ApiClient; request: ReturnType<typeof vi.fn> } {
  const request = vi.fn((options: { path: string; method?: string }) =>
    Promise.resolve(handler(options)),
  );
  return { api: { request } as unknown as ApiClient, request };
}

function renderPage(
  element: ReactElement,
  initialEntry: string,
  api: ApiClient,
): void {
  const app = {
    services: {
      resolve: (token: unknown) => {
        if (token === apiClientToken) return api;
        throw new Error(`Unexpected service token: ${String(token)}`);
      },
    },
  } as unknown as ClientApplication;
  render(
    <ClientApplicationContext.Provider value={app}>
      <I18nProvider runtime={i18nRuntime}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path='/service-requests' element={element} />
            <Route path='/service-requests/:id' element={element} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </ClientApplicationContext.Provider>,
  );
}

describe('service request pages', () => {
  it('accepts a pending request and shows the result the workflow recorded', async () => {
    const { api, request } = createApiClient(({ path }) => {
      if (path === 'service-requests/7') return { data: pendingRequest };
      if (path === 'service-requests/assignees')
        return { data: [{ id: 'u1', name: 'Alice' }] };
      if (path === 'service-requests/7/accept')
        return { data: { request: acceptedRequest, runId: '12' } };
      throw new Error(`Unexpected request: ${path}`);
    });

    renderPage(<ServiceRequestDetailPage />, '/service-requests/7', api);

    expect(
      await screen.findByRole('heading', {
        name: 'Broken meeting room projector',
      }),
    ).toBeVisible();
    expect(screen.getByText('Urgent')).toBeVisible();
    expect(screen.getByText('Alice')).toBeVisible();
    expect(screen.getByText('Pending')).toBeVisible();
    expect(screen.getAllByText('Not accepted yet')).toHaveLength(2);

    screen.getByRole('button', { name: 'Accept' }).click();

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: 'service-requests/7/accept',
        }),
      ),
    );
    expect(await screen.findByText('Accepted')).toBeVisible();
    expect(screen.getByText('Urgent accepted')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Accept' }),
    ).not.toBeInTheDocument();
  });

  it('lists requests with their assignee and acceptance state', async () => {
    const otherRequest: ServiceRequest = {
      ...acceptedRequest,
      id: 8,
      result: 'normal',
      title: 'Laptop replacement',
    };
    const { api } = createApiClient(({ path }) => {
      if (path === 'service-requests')
        return { data: [pendingRequest, otherRequest] };
      if (path === 'service-requests/assignees')
        return { data: [{ id: 'u1', name: 'Alice' }] };
      throw new Error(`Unexpected request: ${path}`);
    });

    renderPage(<ServiceRequestsPage />, '/service-requests', api);

    expect(
      await screen.findByRole('link', {
        name: 'Broken meeting room projector',
      }),
    ).toHaveAttribute('href', '/service-requests/7');
    expect(
      screen.getByRole('link', { name: 'Laptop replacement' }),
    ).toHaveAttribute('href', '/service-requests/8');
    expect(screen.getAllByText('Alice')).toHaveLength(2);
    expect(screen.getByText('Pending')).toBeVisible();
    expect(screen.getByText('Accepted')).toBeVisible();
    expect(screen.getByText('Normal accepted')).toBeVisible();
  });
});
