// The materials list page: what a reader and an owner each see, and what a request failure does. The page reads the
// requester's capabilities from the endpoint's `meta` and shows or hides each action from them (see the materials
// server feature), so the two cases below are the two the acceptance criteria name.
import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MaterialsPage from '../../client/pages/materials/index.js';
import enUS from '../../client/locales/en-US.js';

const { api, toaster, refresh } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
  refresh: vi.fn(),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the page checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh }),
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

function material(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 1,
    title: '公开资料 P',
    body: 'A published material.',
    ownerId: 'jia',
    ownerName: '资料员甲',
    published: true,
    confidential: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function capabilities(
  overrides: Partial<Record<string, boolean>> = {},
): Record<string, boolean> {
  return {
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canShare: false,
    ...overrides,
  };
}

function renderAt(url: string): void {
  const router = createMemoryRouter(
    [
      {
        path: '/materials',
        element: <MaterialsPage />,
        children: [{ path: 'new', element: <p>new material</p> }],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
}

describe('materials list', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    refresh.mockReset();
  });

  it('lets a reader read the published material without any maintenance action', async () => {
    api.request.mockResolvedValue({
      data: [material()],
      meta: { page: 1, pageSize: 100, total: 1, capabilities: capabilities() },
    });
    renderAt('/materials');

    expect(await screen.findByText('公开资料 P')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enUS['materials.create.action'] }),
    ).not.toBeInTheDocument();
    // A reader has no row actions at all: the column is left out, and the endpoint would refuse an edit anyway.
    expect(
      screen.queryByRole('button', {
        name: enUS['materials.actions.more'].replace('{{name}}', '公开资料 P'),
      }),
    ).not.toBeInTheDocument();
  });

  it('offers the owner the create action', async () => {
    api.request.mockResolvedValue({
      data: [material()],
      meta: {
        page: 1,
        pageSize: 100,
        total: 1,
        capabilities: capabilities({ canCreate: true, canUpdate: true }),
      },
    });
    renderAt('/materials');

    expect(
      await screen.findByRole('button', {
        name: enUS['materials.create.action'],
      }),
    ).toBeInTheDocument();
  });

  it('shows the session-expired state when the list request is unauthenticated', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Unauthorized', {
        status: 401,
        method: 'GET',
        url: '/api/materials',
      }),
    );
    renderAt('/materials');

    expect(
      await screen.findByText(enUS['status.sessionExpired']),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: enUS['actions.signInAgain'] }),
    ).toBeInTheDocument();
  });
});
